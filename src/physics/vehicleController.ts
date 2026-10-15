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
 * Rapier is f32, so the body is measured from a floating render origin near the rig (ticket 339,
 * `bodyFrame`); every rule here reads planet metres.
 *
 * It keeps the bore struts' planks too (ticket 379, `strutColliders.ts`): the rig lands on one, and
 * its wheels count it as ground.
 *
 * While a slice's glide runs (ticket 390, `motionGlide.ts`) the input is locked, so the wheels,
 * lift, drill and swivel rest, and the halo leaves out the walls of the one cell the glide passes
 * through, on every substep of the tick.
 *
 * The motor also steps the world through its tick (ticket 334, `tickStepping.ts`): `step` runs the
 * motion rule once and plans the tick from the speed it set, `stepWorld` then steps the world in
 * as many substeps as that speed needs, the halo synced round the body before each, or past the
 * substep budget sweeps the body against the ground with no contact solve.
 */
import type RAPIER from '@dimforge/rapier3d-compat'
import { PHYSICS_TIMESTEP, VEHICLE_COLLIDER_SIZE } from '../constants/physics'
import { NO_STRUTS, type StandingStruts } from '../systems/authority/bore/strutState'
import type { CutFollow, CutFollowStep } from '../systems/authority/cutFollowRead'
import type { RenderOrigin } from '../systems/render/renderOrigin'
import { blockOfPoint } from '../systems/vehicle/colliderHalo'
import type { DrillContactRule } from '../systems/vehicle/drillContact'
import type { StepBounds } from '../systems/vehicle/stepBound'
import { plannedTickOf, tickPlanOf, type TickPlan } from '../systems/vehicle/tickPlan'
import type { EngineStats } from '../systems/economy/vehicleStats'
import {
  newDrillHead,
  settledFacingOf,
  stepDrillHead,
  type DrillHead,
} from '../systems/vehicle/drillHead'
import { cutMemoryAfter, FRESH_CUT_MEMORY, type CutMemory } from '../systems/vehicle/heldCut'
import { localUpOf, type Vector2 } from '../systems/vehicle/localFrame'
import type { ActionFlags } from '../systems/vehicle/poseReport'
import { quantisePose } from '../systems/vehicle/poseReport'
import { gravityAt } from '../systems/vehicle/radialGravity'
import { IDLE_INTENT, type VehicleIntent } from '../systems/vehicle/vehicleIntent'
import {
  isInputLocked,
  isPlainMotion,
  passThroughOf,
  type VehicleMotion,
} from '../systems/vehicle/motionEffects'
import {
  groundProbeOf,
  offsetToTileCentre,
  stepVehicleMotion,
  surfaceProbesOf,
  type MotionEffectInput,
} from '../systems/vehicle/vehicleMotion'
import { FACING, type Facing, type VehiclePose } from '../systems/vehicle/vehiclePose'
import type { GroundReader } from '../systems/world/groundReader'
import type { TilePoint } from '../systems/world/tileGrid'
import { ISO_DENSITY } from '../systems/world/sampleGrid'
import {
  createBodyFrame,
  placeBodyAt,
  type OriginFollower,
  placementNear,
  planetPositionOf,
  recentreWhenFar,
} from './bodyFrame'
import { cutFollowReadFor, cutTickFor, drillContactFor, maxSpeedFor } from './drillEngagement'
import { createGroundHalo, type GroundHalo, type HaloGround } from './groundHalo'
import { createStrutColliders, type StrutColliders } from './strutColliders'
import { stepWorldThroughTick, sweepGroundOf } from './tickStepping'

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
  /** What the drill bites on: `drillContactOf` when absent, wider with the swept cut (ticket 330). */
  drillContactRule?: DrillContactRule
  /**
   * The cut gate and the drill's cut speed at this step's pose, read before the step's cut (ticket
   * 333, `cutFollowRead.ts`); absent with the swept cut off, so the engine alone drives.
   */
  cutFollowOf?: (step: CutFollowStep) => CutFollow
  /**
   * The rig's stats-derived step bounds (ticket 334, `stepBound.ts`): the speed the body is clamped
   * to and the wheels' wait-for-cut window; absent with the swept cut off (18 m/s, 250 mm).
   */
  stepBounds?: StepBounds
  /** The bore struts standing now (ticket 379), the rig lands on their planks; none when absent. */
  struts?: StandingStruts
}

export interface VehicleStepResult {
  flags: ActionFlags
  pose: VehiclePose
  /**
   * The wheels held this step in a level cut (the swept cut's limiter tag): for ground in the way,
   * or while the drill sets the speed only on a span stop (ticket 400).
   */
  isWaitingForCut: boolean
  /** The cut gate was open: the drill set the speed along the facing (ticket 333). */
  isCutting: boolean
}

export interface VehicleController {
  /** Call once per fixed step: the motion rule, and the plan for stepping the world through it. */
  step(input: VehicleStepInput, planet: PlanetView): VehicleStepResult
  /** Then steps the world through the tick `step` planned (ticket 334); never call `world.step`. */
  stepWorld(): void
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

/** Collision blocks of halo round the vehicle's block; at 0.4 m a substep it never outruns one. */
export const HALO_RADIUS_BLOCKS = 1

/** Share of the remaining tilt removed per step; under 1 so contact pushes settle smoothly. */
const RIGHTING_GAIN = 0.5

// Reused every physics step: setLinvel and setAngvel copy what they are given.
const scratchVelocity = { x: 0, y: 0, z: 0 }
const scratchSpin = { x: 0, y: 0, z: 0 }

/** The body at a pose, measured from the chunk corner nearest it. */
export function createVehicleBody(
  rapier: Rapier,
  world: RAPIER.World,
  pose: VehiclePose,
): PlacedVehicleBody {
  const { origin, at } = placementNear(pose)
  const body = world.createRigidBody(
    rapier.RigidBodyDesc.dynamic()
      .setTranslation(at.x, at.y, 0)
      .enabledTranslations(true, true, false)
      .enabledRotations(false, false, true)
      .setGravityScale(0)
      .setCanSleep(false),
  )
  const half = VEHICLE_COLLIDER_SIZE / 2
  world.createCollider(rapier.ColliderDesc.cuboid(half, half, half).setFriction(0), body)
  return { body, origin }
}

export function createVehicleController(
  rapier: Rapier,
  world: RAPIER.World,
  placed: PlacedVehicleBody,
  options: VehicleControllerOptions = {},
): VehicleController {
  const { body } = placed
  const frame = createBodyFrame(placed.origin, options.originReachMm)
  const halo = createGroundHalo(rapier, world, HALO_RADIUS_BLOCKS, frame.origin)
  const struts = createStrutColliders(rapier, world, frame.origin)
  const colliders = followersOf(halo, struts)
  let head = newDrillHead(FACING.right)
  let up: Vector2 = { x: 0, y: 1 }
  let plan: TickPlan = tickPlanOf(0)
  // The hold's count (ticket 400) and the last `vCut`, held through the gate's shut dwell (430).
  let cutMemory: CutMemory = FRESH_CUT_MEMORY
  let lastPlanet: { view: PlanetView; ground: HaloGround } | null = null
  let passThrough: TilePoint | null = null
  const syncHaloAt = (position: Vector2) => {
    if (lastPlanet === null) return
    const { view, ground } = lastPlanet
    halo.syncAround(blockOfPoint(position), view.worldVersion, ground, passThrough)
  }
  const tick = {
    world,
    body,
    syncHalo: () => syncHaloAt(planetPositionOf(body, frame.origin)),
  }

  return {
    step(stepInput, planet) {
      const input = withInputLockedWhenGliding(stepInput)
      const position = planetPositionOf(body, frame.origin)
      recentreWhenFar(body, colliders, frame, position)
      const velocity = vectorOf(body.linvel())
      up = localUpOf(position, up)
      lastPlanet = lastPlanet?.view === planet ? lastPlanet : haloPlanetOf(planet)
      passThrough = passThroughOf(input.motion)
      syncHaloAt(position)
      struts.sync(input.struts ?? NO_STRUTS)
      head = stepDrillHead(head, input.intent.facing)
      // The velocity the body actually had, after contacts, so a resting vehicle reports 0.
      const pose = quantisePose(position, velocity, up, settledFacingOf(head))
      const isLifting = input.canAct && input.intent.lift
      const contact = input.canAct
        ? drillContactFor(input, head, { pose, isLifting }, planet.ground, cutMemory.followedTicks)
        : 'none'
      const isDrilling = contact !== 'none'
      const isCuttingLevel = isDrilling && !isLifting && isSidewaysFacing(pose.facing)
      const cutRead = cutFollowReadFor(input, { pose, isLifting }, isDrilling)
      const cutStart = { read: cutRead, memory: cutMemory, contact, isCuttingLevel }
      const cutTick = cutTickFor(input, { pose, isLifting }, cutStart, planet.ground)
      const { cut: cutFollow, isGateOpen, isWaitingForCut } = cutTick
      cutMemory = cutMemoryAfter(cutMemory, cutTick)
      const motion = stepVehicleMotion({
        velocity,
        up,
        gravity: gravityAt(position, planet.radiusTiles, planet.gravityMultiplier),
        intent: input.intent,
        engine: input.engine,
        canAct: input.canAct,
        isGrounded: isGroundedAt(planet.ground, struts, groundProbeOf(position, up)),
        boreOffset: isAimingAlongUp(input.intent) ? offsetToTileCentre(position, up) : null,
        isCuttingLevel: isCuttingLevel,
        isWaitingForCut,
        dt: PHYSICS_TIMESTEP,
        effect: motionEffectInputOf(input.motion, position, up, planet.ground),
        tug: input.tug,
        cutFollow,
        maxSpeed: maxSpeedFor(input, cutRead),
      })
      const sweep = sweepGroundOf(planet.ground, position, isGateOpen ? pose : null)
      const planned = plannedTickOf(motion.velocity, PHYSICS_TIMESTEP, sweep)
      plan = planned.plan
      driveBody(body, planned.velocity, up)
      return {
        flags: { isDriving: motion.isDriving, isThrusting: motion.isThrusting, isDrilling },
        pose,
        isWaitingForCut,
        isCutting: isGateOpen,
      }
    },
    stepWorld: () => stepWorldThroughTick(tick, plan),
    placeAt(pose) {
      placeBodyAt(body, colliders, frame, pose)
      body.setLinvel({ x: 0, y: 0, z: 0 }, true)
      head = newDrillHead(pose.facing)
      cutMemory = FRESH_CUT_MEMORY
    },
    planetPosition: () => planetPositionOf(body, frame.origin),
    renderOrigin: () => frame.origin,
    drillHead: () => head,
    colliderCount: () => halo.colliderCount(),
    dispose() {
      halo.dispose()
      struts.dispose()
    },
  }
}

/** A glide locks the input (ticket 390): the step runs as if nothing were held. */
function withInputLockedWhenGliding(input: VehicleStepInput): VehicleStepInput {
  if (input.motion === undefined || !isInputLocked(input.motion)) return input
  return { ...input, intent: IDLE_INTENT }
}

/** The halo's and the struts' colliders, moved together when the origin moves. */
function followersOf(halo: GroundHalo, struts: StrutColliders): OriginFollower {
  return {
    moveOrigin(next) {
      halo.moveOrigin(next)
      struts.moveOrigin(next)
    },
  }
}

/** Ground under the wheels: solid ground, or a strut's plank (ticket 379). */
function isGroundedAt(ground: GroundReader, struts: StrutColliders, probe: Vector2): boolean {
  return isSolidAt(ground, probe) || struts.isOnPlank(probe)
}

/** What the halo reads of a planet view, built once per view. */
function haloPlanetOf(view: PlanetView): { view: PlanetView; ground: HaloGround } {
  return { view, ground: { densityAt: view.ground.densityAt, chunkVersion: view.chunkVersion } }
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
