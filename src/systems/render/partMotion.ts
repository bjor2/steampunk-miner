/**
 * Vehicle part motion (#48 "State drives motion", #38 animation technique: procedural transforms
 * on layered parts, no rigs, no flipbooks). The motion steps once per physics tick from what the
 * vehicle did that tick: wheels roll with the signed ground speed, the drill turns a fixed angle
 * per drilling tick, pistons pump with thrust, the boiler bobs with the energy draw. A landing
 * squashes the chassis and a hit recoils it, unless the player turned motion effects off. While
 * idle only the boiler's slow breath and the headlamp's flicker move. Each part's pose is read
 * from the motion by its slot, so the same rule poses the placeholder quads and the S7a art. A
 * slice's requested pose for a slot (`partMotionRequests`, #180) adds to it, its movement skipped
 * like the squash when motion is reduced. Presentation only: it reads the vehicle, never writes it.
 */
import {
  BOILER_BOB_HZ,
  BOILER_BOB_M,
  BOILER_BREATH_HZ,
  BOILER_BREATH_M,
  DRILL_RADIANS_PER_TICK,
  HEADLAMP_FLICKER_SHARE,
  HIT_RECOIL_M,
  HIT_SETTLE_SECONDS,
  HIT_SNAP_SECONDS,
  LANDING_SPEED_MPS,
  LANDING_SQUASH_SECONDS,
  LANDING_SQUASH_SHARE,
  LOAD_EASE_SECONDS,
  PISTON_HZ,
  PISTON_TRAVEL_M,
} from '../../constants/scene'
import { createRequestedParts, type RequestedPartPose, type RequestedParts } from './requestedParts'

const TURN = 2 * Math.PI
const HIT_SECONDS = HIT_SNAP_SECONDS + HIT_SETTLE_SECONDS

/** What the vehicle did this tick, in its own frame. */
export interface PartMotionStep {
  /** Ground speed along the vehicle's tangent, metres per second; positive to its right. */
  alongMetresPerSecond: number
  /** Speed along local up, metres per second; negative while falling. */
  upMetresPerSecond: number
  isDriving: boolean
  isThrusting: boolean
  isDrilling: boolean
}

export interface PartMotion {
  /** Metres the wheels' rims have rolled; a wheel's angle is this over its radius. */
  rolledMetres: number
  drillTicks: number
  pistonTurns: number
  /** The energy draw, 0 to 1, eased. */
  load: number
  /** Seconds of motion, for the breath, the bob and the flicker. */
  seconds: number
  wasFalling: boolean
  squashSeconds: number
  hitSeconds: number
  /** What slices ask of the parts this step (`partMotionRequests`); nothing by default. */
  requested: RequestedParts
}

/** One part's transform around its pivot, and how brightly it glows (1 is its own colour). */
export interface PartPose {
  angle: number
  x: number
  y: number
  scaleY: number
  glow: number
}

export function createPartMotion(): PartMotion {
  return {
    rolledMetres: 0,
    drillTicks: 0,
    pistonTurns: 0,
    load: 0,
    seconds: 0,
    wasFalling: false,
    squashSeconds: 0,
    hitSeconds: 0,
    requested: createRequestedParts(),
  }
}

export function createPartPose(): PartPose {
  return { angle: 0, x: 0, y: 0, scaleY: 1, glow: 0 }
}

/** One physics tick of `dt` seconds. */
export function stepPartMotion(motion: PartMotion, step: PartMotionStep, dt: number): void {
  motion.rolledMetres += step.alongMetresPerSecond * dt
  if (step.isDrilling) motion.drillTicks++
  if (step.isThrusting) motion.pistonTurns += PISTON_HZ * dt
  motion.load += (loadOf(step) - motion.load) * (1 - Math.exp(-dt / LOAD_EASE_SECONDS))
  motion.seconds += dt
  squashOnLanding(motion, step.upMetresPerSecond)
  motion.squashSeconds = Math.max(0, motion.squashSeconds - dt)
  motion.hitSeconds = Math.max(0, motion.hitSeconds - dt)
}

/** A hit on the vehicle (#48: a short 60 ms snap, then it settles). */
export function recoilFromHit(motion: PartMotion): void {
  motion.hitSeconds = HIT_SECONDS
}

/** Drilling draws the most, then thrust, then driving (#7 energy use order). */
function loadOf(step: PartMotionStep): number {
  if (step.isDrilling) return 1
  if (step.isThrusting) return 0.8
  return step.isDriving ? 0.5 : 0
}

function squashOnLanding(motion: PartMotion, upMetresPerSecond: number): void {
  const isFalling = upMetresPerSecond < -LANDING_SPEED_MPS
  if (motion.wasFalling && !isFalling) motion.squashSeconds = LANDING_SQUASH_SECONDS
  motion.wasFalling = isFalling
}

/**
 * The pose of the part in `slot` (its id without the tier, `wheel-2`). `radius` is the part's
 * half-height, for rolling. With `isMotionReduced` the squash and the recoil stay still (#48
 * acceptance 6, the shake switch of #33).
 */
export function writePartPose(
  motion: PartMotion,
  slot: string,
  radius: number,
  isMotionReduced: boolean,
  pose: PartPose,
): void {
  const kind = kindOfSlot(slot)
  pose.angle = angleOf(motion, kind, radius)
  pose.x = isMotionReduced ? 0 : recoilOf(motion)
  pose.y = liftOf(motion, kind)
  pose.scaleY = isMotionReduced || kind !== 'chassis' ? 1 : 1 - squashOf(motion)
  pose.glow = glowOf(motion, kind)
  addRequestedPose(pose, motion.requested.poses.get(slot), isMotionReduced)
}

/** A slice's reaction on the part (#180); with motion reduced only its glow shows. */
function addRequestedPose(
  pose: PartPose,
  requested: RequestedPartPose | undefined,
  isMotionReduced: boolean,
): void {
  if (requested === undefined) return
  pose.glow += requested.glow
  if (isMotionReduced) return
  pose.x += requested.x
  pose.y += requested.y
  pose.angle += requested.angle
}

/** `wheel-2` is a wheel: the repeat suffix never changes how a part moves. */
function kindOfSlot(slot: string): string {
  return slot.replace(/-\d+$/, '')
}

/** Rolling right turns a wheel clockwise, which is a negative angle. */
function angleOf(motion: PartMotion, kind: string, radius: number): number {
  if (kind === 'wheel') return radius > 0 ? -motion.rolledMetres / radius : 0
  if (kind === 'drill-bit') return -motion.drillTicks * DRILL_RADIANS_PER_TICK
  return 0
}

function liftOf(motion: PartMotion, kind: string): number {
  if (kind === 'piston') return PISTON_TRAVEL_M * Math.sin(TURN * motion.pistonTurns)
  if (kind !== 'boiler') return 0
  const breath = BOILER_BREATH_M * Math.sin(TURN * BOILER_BREATH_HZ * motion.seconds)
  return breath + BOILER_BOB_M * motion.load * Math.sin(TURN * BOILER_BOB_HZ * motion.seconds)
}

/** The drill's tip glows with the load while it bites; the lamp flickers a little. */
function glowOf(motion: PartMotion, kind: string): number {
  if (kind === 'drill-bit') return motion.load
  if (kind !== 'headlamp') return 0
  const flicker = Math.sin(TURN * 7.3 * motion.seconds) * Math.sin(TURN * 2.9 * motion.seconds)
  return 1 - HEADLAMP_FLICKER_SHARE * Math.max(0, flicker)
}

/** Full at the landing, gone after `LANDING_SQUASH_SECONDS`. */
function squashOf(motion: PartMotion): number {
  return LANDING_SQUASH_SHARE * (motion.squashSeconds / LANDING_SQUASH_SECONDS)
}

/** Snaps back over 60 ms, then eases home over the settle. */
function recoilOf(motion: PartMotion): number {
  const since = HIT_SECONDS - motion.hitSeconds
  if (motion.hitSeconds <= 0) return 0
  if (since < HIT_SNAP_SECONDS) return -HIT_RECOIL_M * (since / HIT_SNAP_SECONDS)
  return -HIT_RECOIL_M * (motion.hitSeconds / HIT_SETTLE_SECONDS)
}
