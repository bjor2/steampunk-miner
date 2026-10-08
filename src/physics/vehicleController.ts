/**
 * The vehicle's motor: the ONLY writer of the vehicle body's motion. Once per fixed physics step,
 * before the world steps, it reads the body, keeps the ground's collider halo around it, applies one step of
 * the pure motion rule by velocity (never by teleporting), keeps the body upright along
 * `localUp`, swivels the drill head, and says which actions were active and where it stands, for
 * the pose report. The same code runs under React (`VehicleBody`) and in the node physics specs.
 *
 * The world here is 3D Rapier used as 2D (CLAUDE.md): Z translation is locked, only rotation
 * about Z is free, and world gravity is zero because gravity is radial (#7).
 *
 * Rapier is f32, so it measures from a floating render origin near the rig (ticket 339,
 * `renderOrigin`), never from the planet's centre: every rule here still reads planet metres (the
 * body's translation plus the origin, in doubles). When the rig gets more than 1 km from the origin,
 * the origin moves to the nearest chunk corner before the step, and the body and the halo's
 * colliders are moved by the same whole metres in the other direction: the rig stays where it is on
 * the planet, with its velocity and contacts, so nothing jumps and no wall goes missing.
 */
import type RAPIER from '@dimforge/rapier3d-compat'
import {
  MM_PER_METRE,
  PHYSICS_TIMESTEP,
  RENDER_ORIGIN_REACH_MM,
  VEHICLE_COLLIDER_SIZE,
} from '../constants/physics'
import {
  isPastOriginReach,
  renderOriginNear,
  type RenderOrigin,
} from '../systems/render/renderOrigin'
import { blockOfPoint } from '../systems/vehicle/colliderHalo'
import { drillContactOf, type DrillContact } from '../systems/vehicle/drillContact'
import { drillStampOf } from '../systems/vehicle/drillStamp'
import type { EngineStats } from '../systems/economy/vehicleStats'
import {
  isHeadSettled,
  newDrillHead,
  settledFacingOf,
  stepDrillHead,
  type DrillHead,
} from '../systems/vehicle/drillHead'
import { localUpOf, type Vector2 } from '../systems/vehicle/localFrame'
import type { ActionFlags } from '../systems/vehicle/poseReport'
import { quantisePose } from '../systems/vehicle/poseReport'
import { gravityAt } from '../systems/vehicle/radialGravity'
import type { VehicleIntent } from '../systems/vehicle/vehicleIntent'
import { isPlainMotion, type VehicleMotion } from '../systems/vehicle/motionEffects'
import {
  groundProbeOf,
  offsetToTileCentre,
  stepVehicleMotion,
  surfaceProbesOf,
  type MotionEffectInput,
} from '../systems/vehicle/vehicleMotion'
import {
  FACING,
  facingVectorOf,
  type Facing,
  type VehiclePose,
} from '../systems/vehicle/vehiclePose'
import type { GroundReader } from '../systems/world/groundReader'
import { ISO_DENSITY } from '../systems/world/sampleGrid'
import { createGroundHalo, type GroundHalo } from './groundHalo'

type Rapier = typeof RAPIER

/** What the controller needs to know about the planet: its size, its gravity, its ground now. */
export interface PlanetView {
  radiusTiles: number
  gravityMultiplier: number
  /** The world state object; a new identity means the ground may have changed. */
  worldVersion: unknown
  ground: GroundReader
  /** A chunk's version (its delta's identity): the halo rebuilds the blocks over a changed one. */
  chunkVersion(cx: number, cy: number): unknown
}

export interface VehicleStepInput {
  intent: VehicleIntent
  engine: EngineStats
  /** Active with energy left (#7): otherwise the wheels, lift and drill do nothing. */
  canAct: boolean
  /** The slices' motion effects on this vehicle this step (ticket 233); none when absent. */
  motion?: VehicleMotion
  /** A magnetic field's tug in m/s (#258, ticket 290); none when absent. */
  tug?: Vector2
}

export interface VehicleStepResult {
  flags: ActionFlags
  pose: VehiclePose
}

export interface VehicleController {
  /** Call once per fixed step, before the world steps. */
  step(input: VehicleStepInput, planet: PlanetView): VehicleStepResult
  /** A respawn on the dock after the tow or a planet change: the one time the body is placed. */
  placeAt(pose: VehiclePose): void
  /** Where the body is, in planet metres. */
  planetPosition(): Vector2
  /** The point the body's Rapier translation is measured from. */
  renderOrigin(): RenderOrigin
  drillHead(): DrillHead
  colliderCount(): number
  dispose(): void
}

/** A vehicle body and the render origin its translation is measured from. */
export interface PlacedVehicleBody {
  body: RAPIER.RigidBody
  origin: RenderOrigin
}

export interface VehicleControllerOptions {
  /** How far the rig may get from the render origin before it moves; 1 km unless a spec says. */
  originReachMm?: number
}

/** Collision blocks of halo round the vehicle's block; at 0.27 m per step it never outruns one. */
export const HALO_RADIUS_BLOCKS = 1

/** Share of the remaining tilt removed per step; under 1 so contact pushes settle smoothly. */
const RIGHTING_GAIN = 0.5

const MM = MM_PER_METRE

// Reused every physics step: setLinvel and setAngvel copy what they are given.
const scratchVelocity = { x: 0, y: 0, z: 0 }
const scratchSpin = { x: 0, y: 0, z: 0 }

/** The body at a pose, measured from the chunk corner nearest it. */
export function createVehicleBody(
  rapier: Rapier,
  world: RAPIER.World,
  pose: VehiclePose,
): PlacedVehicleBody {
  const origin = renderOriginNear(pose.x, pose.y)
  const body = world.createRigidBody(
    rapier.RigidBodyDesc.dynamic()
      .setTranslation((pose.x - origin.xMm) / MM, (pose.y - origin.yMm) / MM, 0)
      .enabledTranslations(true, true, false)
      .enabledRotations(false, false, true)
      .setGravityScale(0)
      .setCanSleep(false),
  )
  const half = VEHICLE_COLLIDER_SIZE / 2
  world.createCollider(rapier.ColliderDesc.cuboid(half, half, half).setFriction(0), body)
  return { body, origin }
}

/** The render origin the body and the halo are measured from; one object, moved in place. */
interface BodyFrame {
  origin: RenderOrigin
  reachMm: number
}

export function createVehicleController(
  rapier: Rapier,
  world: RAPIER.World,
  placed: PlacedVehicleBody,
  options: VehicleControllerOptions = {},
): VehicleController {
  const { body } = placed
  const frame: BodyFrame = {
    origin: placed.origin,
    reachMm: options.originReachMm ?? RENDER_ORIGIN_REACH_MM,
  }
  const halo = createGroundHalo(rapier, world, HALO_RADIUS_BLOCKS, frame.origin)
  let head = newDrillHead(FACING.right)
  let up: Vector2 = { x: 0, y: 1 }

  return {
    step(input, planet) {
      recentreWhenFar(body, halo, frame)
      const position = planetPositionOf(body, frame.origin)
      const velocity = vectorOf(body.linvel())
      up = localUpOf(position, up)
      halo.syncAround(blockOfPoint(position), planet.worldVersion, {
        densityAt: planet.ground.densityAt,
        chunkVersion: planet.chunkVersion,
      })
      head = stepDrillHead(head, input.intent.facing)
      // The velocity the body actually had, after contacts, so a resting vehicle reports 0.
      const pose = quantisePose(position, velocity, up, settledFacingOf(head))
      const isLifting = input.canAct && input.intent.lift
      const contact = input.canAct
        ? drillContactFor(input.intent, head, pose, isLifting, planet)
        : 'none'
      const isDrilling = contact !== 'none'
      const isCuttingLevel = isDrilling && !isLifting && isSidewaysFacing(pose.facing)
      const motion = stepVehicleMotion({
        velocity,
        up,
        gravity: gravityAt(position, planet.radiusTiles, planet.gravityMultiplier),
        intent: input.intent,
        engine: input.engine,
        canAct: input.canAct,
        isGrounded: isSolidAt(planet.ground, groundProbeOf(position, up)),
        boreOffset: isAimingAlongUp(input.intent) ? offsetToTileCentre(position, up) : null,
        isCuttingLevel: isCuttingLevel,
        isWaitingForCut: isCuttingLevel && contact === 'inTheWay',
        dt: PHYSICS_TIMESTEP,
        effect: motionEffectInputOf(input.motion, position, up, planet.ground),
        tug: input.tug,
      })
      driveBody(body, motion.velocity, up)
      return {
        flags: { isDriving: motion.isDriving, isThrusting: motion.isThrusting, isDrilling },
        pose,
      }
    },
    placeAt(pose) {
      moveOrigin(halo, frame, renderOriginNear(pose.x, pose.y))
      body.setTranslation(fromOrigin(pose, frame.origin), true)
      body.setLinvel({ x: 0, y: 0, z: 0 }, true)
      head = newDrillHead(pose.facing)
    },
    planetPosition: () => planetPositionOf(body, frame.origin),
    renderOrigin: () => frame.origin,
    drillHead: () => head,
    colliderCount: () => halo.colliderCount(),
    dispose: () => halo.dispose(),
  }
}

/**
 * Past the reach the origin moves to the chunk corner nearest the rig. Moving the body with it is
 * no teleport: it changes only what Rapier measures from, by whole metres, so the body keeps its
 * place on the planet, its velocity and, with the walls moved alike, every contact.
 */
function recentreWhenFar(body: RAPIER.RigidBody, halo: GroundHalo, frame: BodyFrame): void {
  const { x, y } = planetPositionOf(body, frame.origin)
  if (!isPastOriginReach(frame.origin, x * MM, y * MM, frame.reachMm)) return
  const was = frame.origin
  moveOrigin(halo, frame, renderOriginNear(x * MM, y * MM))
  shiftBody(body, was, frame.origin)
}

function moveOrigin(halo: GroundHalo, frame: BodyFrame, next: RenderOrigin): void {
  frame.origin = next
  halo.moveOrigin(next)
}

/** Both origins are chunk corners, so the shift is whole metres and f32 adds it exactly. */
function shiftBody(body: RAPIER.RigidBody, was: RenderOrigin, now: RenderOrigin): void {
  const at = body.translation()
  const shift = { x: (was.xMm - now.xMm) / MM, y: (was.yMm - now.yMm) / MM }
  body.setTranslation({ x: at.x + shift.x, y: at.y + shift.y, z: 0 }, true)
}

function planetPositionOf(body: RAPIER.RigidBody, origin: RenderOrigin): Vector2 {
  const at = body.translation()
  return { x: at.x + origin.xMm / MM, y: at.y + origin.yMm / MM }
}

function fromOrigin(pose: VehiclePose, origin: RenderOrigin): { x: number; y: number; z: number } {
  return { x: (pose.x - origin.xMm) / MM, y: (pose.y - origin.yMm) / MM, z: 0 }
}

/**
 * Drilling auto-engages when the player pushes into ground the settled head faces (#7): the held
 * aim matches the facing and the drill's stamp has ground to cut (#36, `drillContact`).
 */
function drillContactFor(
  intent: VehicleIntent,
  head: DrillHead,
  pose: VehiclePose,
  isLifting: boolean,
  planet: PlanetView,
): DrillContact {
  if (intent.facing !== pose.facing || !isHeadSettled(head)) return 'none'
  const facing = facingVectorOf(pose.upx, pose.upy, pose.facing)
  return drillContactOf(planet.ground, {
    centreMm: pose,
    facing,
    stamp: drillStampOf(pose, isLifting),
  })
}

/** The effect for the motion rule, or nothing for no effect; ground is probed only to cling. */
function motionEffectInputOf(
  motion: VehicleMotion | undefined,
  position: Vector2,
  up: Vector2,
  ground: GroundReader,
): MotionEffectInput | undefined {
  if (motion === undefined || isPlainMotion(motion)) return undefined
  const isTouchingSurface = motion.isClinging && isTouchingAnySide(ground, position, up)
  return { motion, position, isTouchingSurface }
}

function isTouchingAnySide(ground: GroundReader, position: Vector2, up: Vector2): boolean {
  return surfaceProbesOf(position, up).some((probe) => isSolidAt(ground, probe))
}

function isSolidAt(ground: GroundReader, point: Vector2): boolean {
  return ground.densityAtPoint(point.x, point.y) >= ISO_DENSITY
}

function isSidewaysFacing(facing: Facing): boolean {
  return facing === FACING.left || facing === FACING.right
}

function isAimingAlongUp(intent: VehicleIntent): boolean {
  return intent.facing === FACING.down || intent.facing === FACING.up
}

/** Motion by velocity; the spin turns the body toward `localUp` (the righting torque of #7). */
function driveBody(body: RAPIER.RigidBody, velocity: Vector2, up: Vector2): void {
  scratchVelocity.x = velocity.x
  scratchVelocity.y = velocity.y
  body.setLinvel(scratchVelocity, true)
  scratchSpin.z = (tiltOf(body.rotation(), up) * RIGHTING_GAIN) / PHYSICS_TIMESTEP
  body.setAngvel(scratchSpin, true)
}

/** The signed angle from the body's up to `localUp`, about Z, in (-pi, pi]. */
function tiltOf(rotation: RAPIER.Rotation, up: Vector2): number {
  const bodyAngle = 2 * Math.atan2(rotation.z, rotation.w)
  const targetAngle = Math.atan2(-up.x, up.y)
  const turn = targetAngle - bodyAngle
  return Math.atan2(Math.sin(turn), Math.cos(turn))
}

function vectorOf(vector: { x: number; y: number }): Vector2 {
  return { x: vector.x, y: vector.y }
}
