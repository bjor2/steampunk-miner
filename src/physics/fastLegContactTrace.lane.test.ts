import RAPIER from '@dimforge/rapier3d-compat'
import { mkdirSync, writeFileSync } from 'node:fs'
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { CUT_FOLLOW_TICKS } from '../constants/balance'
import { MM_PER_METRE, PHYSICS_TIMESTEP, UP_VECTOR_SCALE } from '../constants/physics'
import { createMemorySink } from '../logging/eventSink'
import { createRunLog, installRunLog, uninstallRunLog } from '../logging/runLog'
import { createVehicleLoop } from '../scene/vehicleLoop'
import { readAuthorityState } from '../store/authorityLink'
import {
  readAuthorityTick,
  readLocalVehicle,
  resetGameStore,
  useGameStore,
} from '../store/gameStore'
import type { CutFollow } from '../systems/authority/cutFollowRead'
import { planetParamsOf } from '../systems/authority/planetOfState'
import { buildIntent } from '../systems/input/buildIntent'
import type { Vector2 } from '../systems/vehicle/localFrame'
import type { VehicleIntent } from '../systems/vehicle/vehicleIntent'
import { facingVectorOf, type VehiclePose } from '../systems/vehicle/vehiclePose'
import { groundReaderOf } from '../systems/world/groundReader'
import { ISO_DENSITY } from '../systems/world/sampleGrid'
import type { WorldState } from '../systems/world/worldState'
import { runFixedStepFrame, type FrameClock } from './liveFixedStep'
import {
  createVehicleBody,
  createVehicleController,
  type VehicleController,
  type VehicleStepResult,
} from './vehicleController'

// The two fast legs #459 leaves on `it.todo`, contact by contact (ticket 464, measurement only):
// the 25 m/s rig's up leg and the 44 m/s rig's (rig 1) down leg of `cutSmoothness.test.ts`'s
// script (off the pad, down 3 s, level 3 s, up 2 s) at 30 and 144 frames/s with `drill.sweptCut`
// on. Each tick records the commanded cut speed, the speed the motor set, the body's speed over
// the tick, the standing samples in the commanded step before and after the tick's cut (the
// carry's held cell or a lip stands after it), the carry, and how far past the body's centre the
// cut's cursor (the stamp's centre) and the pose its step reported ended. For each of the world's
// substeps it records the speed the substep left and every solver contact it kept on the body: its
// gap (above 0 a speculative contact the body has not reached), where on the body it sits, how
// much of its normal faces the motion, and whether the ground behind it stands in the world after
// the cut, stood only before it (opened this tick) or is open. Rapier (0.14) finds contacts at the
// end of a step, so a substep solves against the contacts the substep before it left. Each
// ramped-up cut tick under 80% of the cut speed (#421's bar) is named by the substep that lost the
// most speed:
//
// - **standing ground ahead**: ground stands in the commanded step after the cut (held cell, lip,
//   or a cut that fell behind the body);
// - **speculative contact**: the tightest contact facing the motion it solved against has a gap
//   above 0, so the solver held the approach to it: gap / (dt/n * n.f) under the cut speed. It
//   forms only within the world's prediction distance, so its share moves with that setting;
// - **overlap**: the tightest such contact has the body touching or inside the collider;
// - **no contact**: no contact faced the motion (a ramp or the motor).
//
// On main (stale halo) every tick under 80% on both legs is an overlap with ground the tick's own
// cut opened. With #459's post-cut halo sync and Rapier's default prediction distance both legs
// hold the todo's lines; with 0.01 or 0.03 the ticks under 80% are all standing ground ahead, on
// a stretch of the 44 m/s down leg where the cut's cursor falls behind the body's face. The world's
// `normalizedPredictionDistance` is printed with the table, so a run says which contact setting it
// traced. A lane: it runs only when named, and writes the trace to
// balance-report/fast-leg-contact-trace.ndjson for the fix ticket to re-run.

type Leg = 'down' | 'level' | 'up'

interface TracedLeg {
  rig: string
  levels: Record<string, number>
  leg: Leg
}

const TRACED_LEGS: readonly TracedLeg[] = [
  { rig: '25 m/s', levels: { drill_power: 250, drill_tip: 600, engine: 5000 }, leg: 'up' },
  { rig: '44 m/s (rig 1, #400)', levels: { drill_power: 300, drill_tip: 200 }, leg: 'down' },
]
const FRAME_RATES = [30, 144]
/** `cutSmoothness.test.ts`'s #421 interim bar and its 5% line, 2% of a leg's ticks allowed off. */
const MIN_SPEED_SHARE = 0.8
const MAX_OFF_SPEED = 0.05
const MAX_OFF_SPEED_TICK_SHARE = 0.02
const BACKWARDS_M_PER_S = -0.02
/** A contact's normal faces the motion past this share of the facing. */
const FACING_MOTION_SHARE = 0.05
/** Past a contact's gap, this far along its normal is the ground behind it, m. */
const GROUND_BEHIND_M = 0.06
/** Where a contact sits: ahead of this along the facing it is on the face, behind it the rear. */
const FACE_AHEAD_M = 0.4
const BODY_HALF_M = 0.45
const SLAB_SPACING_M = 0.125
const REPORT_FOLDER = new URL('../../balance-report/', import.meta.url)
const RUN_TIMEOUT_MS = 1_200_000

type ContactPlace = 'face' | 'side' | 'rear'
type GroundBehind = 'standing' | 'opened this tick' | 'open'
type UnderBarKind = 'standing ground ahead' | 'speculative contact' | 'overlap' | 'no contact'
const UNDER_BAR_KINDS: readonly UnderBarKind[] = [
  'standing ground ahead',
  'speculative contact',
  'overlap',
  'no contact',
]

/** A solver contact as the world left it, in planet metres. */
interface RawContact {
  gap: number
  point: Vector2
  /** From the body into the ground. */
  normal: { x: number; y: number; z: number }
}

/** What one world substep left: the body's velocity and its contacts. */
interface RawSubstep {
  velocity: Vector2
  contacts: RawContact[]
}

/** A solver contact on the body, read against its facing and the ground. */
interface BodyContact {
  gapMm: number
  place: ContactPlace
  /** The share of its normal, from the body into the ground, along the facing. */
  facingShare: number
  zShare: number
  ground: GroundBehind
}

interface SubstepTrace {
  speed: number
  contacts: BodyContact[]
}

/** One fixed tick of a traced leg. */
interface ContactTick {
  at: number
  tick: number
  isRamped: boolean
  /** Ramped up, and the tick crossed into another cell (`cutSmoothness.test.ts`'s held boundary). */
  isBoundary: boolean
  cutSpeed: number | null
  gate: 0 | 1 | null
  motor: number
  speed: number
  substeps: SubstepTrace[]
  slabSolidBefore: number
  slabSolidAfter: number
  carry: number | null
  reachMm: number | null
  /** How far past the body's centre the pose the cut's step reported stands, mm. */
  reportedPoseMm: number | null
  kind: UnderBarKind | null
  /** The contact that named an under-bar tick, and the approach speed it allowed, m/s. */
  stoppedBy: (BodyContact & { allowedSpeed: number | null }) | null
}

interface LegTrace {
  rig: string
  leg: Leg
  framesPerSecond: number
  predictionDistance: number
  ticks: ContactTick[]
}

/** The live loop a leg plays through, its world's substeps read as they run. */
interface LivePlay {
  world: RAPIER.World
  body: RAPIER.RigidBody
  controller: VehicleController
  loop: ReturnType<typeof createVehicleLoop>
  substeps: RawSubstep[]
}

/** What one fixed tick of the live loop left, before it is read into a `ContactTick`. */
interface SteppedTick {
  result: VehicleStepResult
  read: CutFollow | undefined
  motor: Vector2
  substeps: RawSubstep[]
  before: { position: Vector2; world: WorldState }
  position: Vector2
  after: WorldState
  tick: number
  carry: number | null
  reachMm: number | null
  reportedPoseMm: number | null
}

beforeAll(async () => {
  await RAPIER.init()
})

beforeEach(() => {
  resetGameStore()
  installRunLog(
    createRunLog({ runId: 'run_test', sink: createMemorySink(), secondsSinceStart: () => 0 }),
  )
})

afterEach(() => uninstallRunLog())

const ticksOf = (seconds: number) => Math.round(seconds / PHYSICS_TIMESTEP)

/** `cutSmoothness.test.ts`'s script for the rig, the traced leg read tick by tick. */
function traceLeg({ rig, levels, leg }: TracedLeg, framesPerSecond: number): LegTrace {
  const play = createPlay(levels, framesPerSecond)
  // The Sell bay is the pad's west end (#170), so off the pad is to the left.
  play.hold(buildIntent(['aim_left']), ticksOf(2))
  const legs: Record<Leg, SteppedTick[]> = {
    down: play.hold(buildIntent(['aim_down']), ticksOf(3)),
    level: play.hold(buildIntent(['aim_left']), ticksOf(3)),
    up: play.hold(buildIntent(['lift']), ticksOf(2)),
  }
  const predictionDistance = play.live.world.integrationParameters.normalizedPredictionDistance
  return { rig, leg, framesPerSecond, predictionDistance, ticks: contactTicksOf(legs[leg]) }
}

/** The live loop with `levels` bought, held one render frame at a time. */
function createPlay(levels: Record<string, number>, framesPerSecond: number) {
  for (const [track, level] of Object.entries(levels)) {
    useGameStore.getState().setUpgrade(track, level)
  }
  const live = createLivePlay()
  const clock: FrameClock = { carried: 0 }
  let stepped = 0
  const hold = (intent: VehicleIntent, count: number) => {
    const ticks: SteppedTick[] = []
    const stepWorld = () => {
      if (stepped++ % 60 === 0) useGameStore.getState().setEnergy('150')
      ticks.push(stepTick(live, intent))
    }
    while (ticks.length < count) {
      runFixedStepFrame(clock, 1 / framesPerSecond, { isHeld: () => false, stepWorld })
    }
    return ticks.slice(0, count)
  }
  return { live, hold }
}

function createLivePlay(): LivePlay {
  const world = new RAPIER.World({ x: 0, y: 0, z: 0 })
  world.timestep = PHYSICS_TIMESTEP
  const start = readLocalVehicle().pose
  if (start === null) throw new Error('the starting planet has no dock')
  const { body, origin } = createVehicleBody(RAPIER, world, start)
  const controller = createVehicleController(RAPIER, world, { body, origin })
  const live: LivePlay = {
    world,
    body,
    controller,
    loop: createVehicleLoop({ 'drill.sweptCut': true }),
    substeps: [],
  }
  readEverySubstep(live)
  return live
}

/** Each `world.step` the controller runs also records the velocity and contacts it left. */
function readEverySubstep(live: LivePlay): void {
  const { world, body, controller } = live
  const step = world.step.bind(world)
  world.step = (...args: Parameters<RAPIER.World['step']>) => {
    step(...args)
    live.substeps.push({
      velocity: vectorOf(body.linvel()),
      contacts: rawContactsOf(world, body, controller),
    })
  }
}

/** Every solver contact on the body's collider, in planet metres. */
function rawContactsOf(
  world: RAPIER.World,
  body: RAPIER.RigidBody,
  controller: VehicleController,
): RawContact[] {
  const own = body.collider(0)
  const toPlanet = minus(controller.planetPosition(), vectorOf(body.translation()))
  const contacts: RawContact[] = []
  world.contactPairsWith(own, (other) => {
    world.contactPair(own, other, (manifold, flipped) => {
      const normal = outwardNormalOf(manifold.normal(), flipped)
      for (let at = 0; at < manifold.numSolverContacts(); at++) {
        const point = plus(vectorOf(manifold.solverContactPoint(at)), toPlanet)
        contacts.push({ gap: manifold.solverContactDist(at), point, normal })
      }
    })
  })
  return contacts
}

/** Rapier's normal points from the manifold's first collider: the body's unless `flipped`. */
function outwardNormalOf(
  { x, y, z }: { x: number; y: number; z: number },
  flipped: boolean,
): { x: number; y: number; z: number } {
  return flipped ? { x: -x, y: -y, z: -z } : { x, y, z }
}

/** One fixed tick: the motor's step, the velocity it set, the world's substeps. */
function stepTick(live: LivePlay, intent: VehicleIntent): SteppedTick {
  const { body, controller, loop } = live
  const before = { position: controller.planetPosition(), world: readAuthorityState().world }
  let result: VehicleStepResult | null = null
  let read: CutFollow | undefined
  const watched: VehicleController = {
    ...controller,
    step: (input, planet) => {
      const cutFollowOf = input.cutFollowOf
      const reading =
        cutFollowOf && ((step: Parameters<typeof cutFollowOf>[0]) => (read = cutFollowOf(step)))
      result = controller.step({ ...input, cutFollowOf: reading }, planet)
      return result
    },
  }
  loop.step(watched, intent)
  const motor = vectorOf(body.linvel())
  live.substeps = []
  watched.stepWorld()
  if (result === null) throw new Error('the loop has not stepped the body')
  return steppedTickOf(live, { result, read, motor, before })
}

function steppedTickOf(
  live: LivePlay,
  stepped: Pick<SteppedTick, 'result' | 'read' | 'motor' | 'before'>,
): SteppedTick {
  const position = live.controller.planetPosition()
  const cursor = readLocalVehicle().sweptCut
  const facing = unitFacingOf(stepped.result.pose)
  return {
    ...stepped,
    substeps: live.substeps,
    position,
    after: readAuthorityState().world,
    tick: readAuthorityTick(),
    carry: cursor?.carrySubSteps ?? null,
    reachMm: cursor === undefined ? null : reachPastBodyMm(cursor, position, facing),
    reportedPoseMm: cursor === undefined ? null : reportedPosePastBodyMm(cursor, position, facing),
  }
}

function contactTicksOf(leg: readonly SteppedTick[]): ContactTick[] {
  const ticks = leg.map((tick, at) => contactTickOf(tick, at, leg))
  return ticks.map((tick, at) => namedUnderBar(tick, ticks[at - 1]))
}

function contactTickOf(tick: SteppedTick, at: number, leg: readonly SteppedTick[]): ContactTick {
  const { result, read, motor, before, position, after } = tick
  const facing = unitFacingOf(result.pose)
  const motorAlong = along(motor, facing)
  const slab = slabPointsOf(before.position, facing, motorAlong * PHYSICS_TIMESTEP)
  const isRamped = isRampedCut(leg, at)
  return {
    at,
    tick: tick.tick,
    isRamped,
    isBoundary: isRamped && !isSameCell(leg[at - 1].position, position),
    cutSpeed: read === undefined ? null : hundredthsOf(read.cutSpeed),
    gate: read?.gate.cutGate ?? null,
    motor: hundredthsOf(motorAlong),
    speed: hundredthsOf(along(minus(position, before.position), facing) / PHYSICS_TIMESTEP),
    substeps: tick.substeps.map((substep) => substepTraceOf(substep, tick, facing)),
    slabSolidBefore: countSolid(before.world, slab),
    slabSolidAfter: countSolid(after, slab),
    carry: tick.carry,
    reachMm: tick.reachMm,
    reportedPoseMm: tick.reportedPoseMm,
    kind: null,
    stoppedBy: null,
  }
}

function substepTraceOf(substep: RawSubstep, tick: SteppedTick, facing: Vector2): SubstepTrace {
  return {
    speed: hundredthsOf(along(substep.velocity, facing)),
    contacts: substep.contacts.map((contact) => bodyContactOf(contact, tick, facing)),
  }
}

function bodyContactOf(contact: RawContact, tick: SteppedTick, facing: Vector2): BodyContact {
  const { gap, point, normal } = contact
  return {
    gapMm: Math.round(gap * MM_PER_METRE * 10) / 10,
    place: placeOf(along(minus(point, tick.position), facing)),
    facingShare: hundredthsOf(along(normal, facing)),
    zShare: hundredthsOf(normal.z),
    ground: groundBehindOf(contact, tick),
  }
}

function placeOf(aheadM: number): ContactPlace {
  if (aheadM >= FACE_AHEAD_M) return 'face'
  return aheadM <= -FACE_AHEAD_M ? 'rear' : 'side'
}

/** The ground just past the contact along its normal, in the world after the cut and before it. */
function groundBehindOf({ gap, point, normal }: RawContact, tick: SteppedTick): GroundBehind {
  const reach = Math.max(gap, 0) + GROUND_BEHIND_M
  const behind = { x: point.x + normal.x * reach, y: point.y + normal.y * reach }
  if (isSolidAt(tick.after, behind)) return 'standing'
  return isSolidAt(tick.before.world, behind) ? 'opened this tick' : 'open'
}

/**
 * An under-bar tick named by the substep that lost the most speed, and the contact it solved
 * against that did; the first substep solves against what the tick before left.
 */
function namedUnderBar(tick: ContactTick, previous: ContactTick | undefined): ContactTick {
  if (!isUnderBar(tick)) return tick
  const losing = speedLosingSubstepOf(tick)
  const solved = losing > 0 ? tick.substeps[losing - 1] : previous?.substeps.at(-1)
  const stoppedBy =
    losing < 0 || solved === undefined
      ? null
      : tightestFacingContactOf(solved.contacts, tick.substeps.length)
  const kind = tick.slabSolidAfter > 0 ? 'standing ground ahead' : kindOfStop(stoppedBy)
  return { ...tick, kind, stoppedBy }
}

function isUnderBar({ isRamped, cutSpeed, speed }: ContactTick): boolean {
  return isRamped && cutSpeed !== null && speed < MIN_SPEED_SHARE * cutSpeed
}

/** The index of the substep that lost the most speed; -1 with none. */
function speedLosingSubstepOf({ motor, substeps }: ContactTick): number {
  const losses = substeps.map((substep, at) => (substeps[at - 1]?.speed ?? motor) - substep.speed)
  const largest = Math.max(0, ...losses)
  return largest > 0 ? losses.indexOf(largest) : -1
}

/**
 * The contact facing the motion that allowed the slowest approach: a speculative one holds the
 * closing speed along its normal to its gap over the substep; a touching one allows none.
 */
function tightestFacingContactOf(
  contacts: readonly BodyContact[],
  substepCount: number,
): ContactTick['stoppedBy'] {
  const substepSeconds = PHYSICS_TIMESTEP / substepCount
  const facingMotion = contacts.filter(({ facingShare }) => facingShare > FACING_MOTION_SHARE)
  const allowed = facingMotion.map((contact) => ({
    ...contact,
    allowedSpeed:
      contact.gapMm > 0
        ? hundredthsOf(contact.gapMm / MM_PER_METRE / (substepSeconds * contact.facingShare))
        : null,
  }))
  return allowed.reduce<ContactTick['stoppedBy']>(
    (tightest, contact) => (isTighter(contact, tightest) ? contact : tightest),
    null,
  )
}

function isTighter(
  contact: NonNullable<ContactTick['stoppedBy']>,
  than: ContactTick['stoppedBy'],
): boolean {
  if (than === null) return true
  return (contact.allowedSpeed ?? 0) < (than.allowedSpeed ?? 0)
}

function kindOfStop(stoppedBy: ContactTick['stoppedBy']): UnderBarKind {
  if (stoppedBy === null) return 'no contact'
  return stoppedBy.gapMm > 0 ? 'speculative contact' : 'overlap'
}

/** `cutSmoothness.test.ts`'s ramped-up cut tick: one drill speed from the ramp before to the next. */
function isRampedCut(leg: readonly SteppedTick[], at: number): boolean {
  if (at < CUT_FOLLOW_TICKS + 2 || at + 1 >= leg.length) return false
  const speed = leg[at].read?.cutSpeed
  return leg
    .slice(at - CUT_FOLLOW_TICKS - 2, at + 2)
    .every(({ result, read }) => result.isCutting && read?.cutSpeed === speed)
}

function isSameCell(a: Vector2, b: Vector2): boolean {
  return Math.floor(a.x) === Math.floor(b.x) && Math.floor(a.y) === Math.floor(b.y)
}

/** Sample points of the slab the commanded move sweeps: from the body's face, across the body. */
function slabPointsOf(from: Vector2, facing: Vector2, stepM: number): Vector2[] {
  const points: Vector2[] = []
  const across = { x: -facing.y, y: facing.x }
  for (let ahead = BODY_HALF_M; ahead <= BODY_HALF_M + stepM; ahead += SLAB_SPACING_M) {
    for (let side = -BODY_HALF_M; side <= BODY_HALF_M; side += SLAB_SPACING_M) {
      points.push({
        x: from.x + facing.x * ahead + across.x * side,
        y: from.y + facing.y * ahead + across.y * side,
      })
    }
  }
  return points
}

function countSolid(world: WorldState, points: readonly Vector2[]): number {
  return points.filter((point) => isSolidAt(world, point)).length
}

function isSolidAt(world: WorldState, { x, y }: Vector2): boolean {
  const params = planetParamsOf(readAuthorityState().planet)
  if (params === null) return false
  return groundReaderOf(world, params).densityAtPoint(x, y) >= ISO_DENSITY
}

function reachPastBodyMm(
  cursor: { xMm: number; yMm: number },
  position: Vector2,
  facing: Vector2,
): number {
  const reach = { x: cursor.xMm / MM_PER_METRE, y: cursor.yMm / MM_PER_METRE }
  return Math.round(along(minus(reach, position), facing) * MM_PER_METRE)
}

function reportedPosePastBodyMm(
  cursor: { poseXMm: number; poseYMm: number },
  position: Vector2,
  facing: Vector2,
): number {
  return reachPastBodyMm({ xMm: cursor.poseXMm, yMm: cursor.poseYMm }, position, facing)
}

function unitFacingOf(pose: VehiclePose): Vector2 {
  const facing = facingVectorOf(pose.upx, pose.upy, pose.facing)
  return { x: facing.x / UP_VECTOR_SCALE, y: facing.y / UP_VECTOR_SCALE }
}

function along(vector: Vector2, axis: Vector2): number {
  return vector.x * axis.x + vector.y * axis.y
}

function minus(a: Vector2, b: Vector2): Vector2 {
  return { x: a.x - b.x, y: a.y - b.y }
}

function plus(a: Vector2, b: Vector2): Vector2 {
  return { x: a.x + b.x, y: a.y + b.y }
}

function vectorOf({ x, y }: { x: number; y: number }): Vector2 {
  return { x, y }
}

function hundredthsOf(value: number): number {
  return Math.round(value * 100) / 100
}

function traceAllLegs(): LegTrace[] {
  return TRACED_LEGS.flatMap((traced) =>
    FRAME_RATES.map((framesPerSecond) => {
      resetGameStore()
      return traceLeg(traced, framesPerSecond)
    }),
  )
}

function isOffSpeed({ speed, cutSpeed }: ContactTick): boolean {
  return cutSpeed !== null && Math.abs(speed - cutSpeed) > MAX_OFF_SPEED * cutSpeed
}

/** The largest share the speed changes by across a held boundary, as `cutSmoothness` reads it. */
function largestBoundaryChangeOf(ticks: readonly ContactTick[]): number {
  const changes = ticks.flatMap((tick, at) => {
    if (!tick.isBoundary) return []
    const before = ticks[at - 1].speed
    return [tick.speed, ticks[at + 1].speed].map((speed) => Math.abs(speed - before) / before)
  })
  return Math.max(0, ...changes)
}

/** The swept cut's cursor ended the tick short of the body's face: the cut lags the body. */
function isCursorBehindFace({ reachMm }: ContactTick): boolean {
  return reachMm !== null && reachMm < BODY_HALF_M * MM_PER_METRE
}

function shareOf({ speed, cutSpeed }: ContactTick): number {
  return cutSpeed === null || cutSpeed === 0 ? 1 : speed / cutSpeed
}

function deepestOverlapMmOf(ticks: readonly ContactTick[]): number {
  const gaps = ticks.flatMap(({ substeps }) =>
    substeps.flatMap(({ contacts }) => contacts.map(({ gapMm }) => gapMm)),
  )
  return Math.min(0, ...gaps)
}

/** An under-bar tick, short: its index, kind, and the stopping contact's place, gap and ground. */
function describeUnderBar({ at, speed, cutSpeed, kind, stoppedBy }: ContactTick): string {
  const share = `${at}: ${speed}/${cutSpeed} ${kind}`
  if (stoppedBy === null) return share
  const { place, gapMm, facingShare, ground, allowedSpeed } = stoppedBy
  return `${share} (${place}, gap ${gapMm} mm, n.f ${facingShare}, ${ground}, allows ${allowedSpeed})`
}

/**
 * One row: the todo's lines (backwards, under 80%, 5% off against the 2% allowed, the largest
 * change across a cell boundary), the ticks under 80% by kind, the ramped ticks the cut's cursor
 * ended behind the face and those with ground standing in the commanded step, the lowest share
 * and the deepest overlap any substep left.
 */
function formatLegRow({ rig, leg, framesPerSecond, ticks }: LegTrace): string {
  const ramped = ticks.filter((tick) => tick.isRamped)
  const under = ticks.filter((tick) => tick.kind !== null)
  return [
    rig,
    leg,
    framesPerSecond,
    ramped.length,
    ramped.filter(({ speed }) => speed < BACKWARDS_M_PER_S).length,
    under.length,
    `${ramped.filter(isOffSpeed).length}/${Math.floor(MAX_OFF_SPEED_TICK_SHARE * ticks.length)}`,
    largestBoundaryChangeOf(ticks).toFixed(3),
    ...UNDER_BAR_KINDS.map((kind) => under.filter((tick) => tick.kind === kind).length),
    ramped.filter(isCursorBehindFace).length,
    ramped.filter(({ slabSolidAfter }) => slabSolidAfter > 0).length,
    Math.min(1, ...ramped.map(shareOf)).toFixed(3),
    deepestOverlapMmOf(ramped).toFixed(1),
    under.map(describeUnderBar).join('; ') || '-',
  ].join(' | ')
}

function formatTable(traces: readonly LegTrace[]): string {
  const header = [
    `prediction distance ${traces[0]?.predictionDistance.toFixed(4)}`,
    'rig | leg | fps | ramped | backwards | under 80% | 5% off / allowed | largest boundary change',
    UNDER_BAR_KINDS.join(' | '),
    'cursor behind the face | ground standing in the step',
    'lowest share | deepest overlap mm | under-80% ticks',
  ].join(' | ')
  return [header, ...traces.map(formatLegRow)].join('\n')
}

function writeTrace(traces: readonly LegTrace[]): void {
  mkdirSync(REPORT_FOLDER, { recursive: true })
  const lines = traces.map((trace) => JSON.stringify({ ticket: 464, ...trace }))
  writeFileSync(new URL('fast-leg-contact-trace.ndjson', REPORT_FOLDER), `${lines.join('\n')}\n`)
}

describe('the 25 m/s up and 44 m/s down legs, contact by contact (ticket 464)', () => {
  let traces: LegTrace[] = []

  beforeAll(() => {
    traces = traceAllLegs()
    console.log(formatTable(traces))
    writeTrace(traces)
  }, RUN_TIMEOUT_MS)

  it('cuts with ramped-up ticks to judge on every traced leg and frame rate', () => {
    const empty = traces.filter(({ ticks }) => !ticks.some((tick) => tick.isRamped))
    expect(empty.map(({ rig, leg }) => `${rig} ${leg}`)).toEqual([])
  })

  it('traces a leg alike at 30 and 144 frames/s', () => {
    for (const { rig, leg } of TRACED_LEGS) {
      const [slow, fast] = FRAME_RATES.map((rate) =>
        traces.find((t) => t.rig === rig && t.leg === leg && t.framesPerSecond === rate),
      )
      expect(fast?.ticks).toEqual(slow?.ticks)
    }
  })
})
