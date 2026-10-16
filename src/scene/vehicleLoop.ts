/**
 * The live game's fixed step for the local vehicle (#3, #11): the authority's clock moves one
 * tick, the controller drives the body for that tick with the current intent, the step's actions
 * are counted, a pose report goes to the authority when one is due (with the drive the intent
 * pushes, ticket 279), the drill's facing and activity go to the scene for the headlamp and
 * sparks, the speed and lift to the sounds, and the tick's motion to the part animation (#48). After the tow or a planet change the body
 * is placed on the dock the authority put the vehicle on. A dock building may stage the vehicle
 * first (#170 auto-roll, `vehicleStage.ts`): the drawn car and the camera move, the body does not.
 * On a magnetic planet the field the body stood in at the last step tugs it (#258, ticket 290),
 * unless that step's drill was cutting behind a shield (the dielectric bit, ticket 292).
 * With the dev flag `drill.sweptCut` on (ticket 330) every step the drill is engaged also sends a
 * `drillStep`, before the step's report, so the authority cuts every tick, and (ticket 333) the
 * motor reads the cut gate and the drill's speed from the authority before the step's cut and
 * drives on an engine whose top speed is travel parity's, and (ticket 334) clamps the body to the
 * rig's stats-derived step bound and widens the wheels' wait-for-cut window to it; off, nothing
 * changes. With it on, the motor's substeps then collide with the world that step's cut and report
 * left, not the one the step read (ticket 459). The bore struts standing in the authority's state
 * go to the motor, which lands the body on their planks (ticket 379).
 */
import { DEV_FLAGS, type DevFlags } from '../constants/devFlags'
import { MM_PER_METRE, UP_VECTOR_SCALE } from '../constants/physics'
import type { PlanetView, VehicleController, VehicleStepResult } from '../physics/vehicleController'
import {
  readAuthorityTick,
  readLocalVehicle,
  readPlanetWorld,
  useGameStore,
} from '../store/gameStore'
import { readAuthorityState } from '../store/authorityLink'
import type { AuthorityState } from '../systems/authority/authorityState'
import { strutsOf } from '../systems/authority/bore/strutState'
import { cutFollowAt, type CutFollow, type CutFollowStep } from '../systems/authority/cutFollowRead'
import { stepBoundsAt } from '../systems/authority/stepBoundRead'
import { travelEngineAt } from '../systems/authority/travelSpeed'
import { magneticTugAt, magneticTugOnCutAt } from '../systems/authority/magnetic/magneticTug'
import { engineStatsAtStep, type EngineStats } from '../systems/economy/vehicleStats'
import { vehicleMotionAt, type VehicleMotion } from '../systems/registries/vehicleMotionEffects'
import {
  countActionStep,
  NEW_POSE_REPORTER,
  takePoseReport,
  type PoseReporter,
} from '../systems/vehicle/poseReport'
import type { StepBounds } from '../systems/vehicle/stepBound'
import type { VehicleIntent } from '../systems/vehicle/vehicleIntent'
import type { Vector2 } from '../systems/vehicle/localFrame'
import { driveSignsOfIntent } from '../systems/vehicle/driveSigns'
import { drillStepCommand } from '../systems/vehicle/vehicleCommands'
import {
  levelSliverDrillContactOf,
  sweptDrillContactOf,
  type DrillContactRule,
} from '../systems/vehicle/drillContact'
import { facingVectorOf, noseTileOf } from '../systems/vehicle/vehiclePose'
import type { VehicleState } from '../systems/vehicle/vehicleState'
import type { PlanetParams } from '../systems/world/planetParams'
import { groundReaderOf } from '../systems/world/groundReader'
import { chunkKey, type TilePoint } from '../systems/world/tileGrid'
import type { WorldState } from '../systems/world/worldState'
import { drillPresence } from './drillPresence'
import { motionPresence } from './motionPresence'
import { stepVehicleParts } from './partMotionPresence'
import { renderPresence } from './renderPresence'
import { createVehicleStage, type VehicleStage } from './vehicleStage'

const HALF_TILE = 0.5

export interface VehicleLoop {
  step(controller: VehicleController, intent: VehicleIntent): void
}

interface LoopState {
  stage: VehicleStage
  reporter: PoseReporter
  placement: string
  view: { world: WorldState; params: PlanetParams; planet: PlanetView } | null
  /** The tile the body stood on after the last step (scratch, rewritten each step). */
  tile: TilePoint
  /** Whether the drill cut on the last step. */
  isCutting: boolean
  hasStepped: boolean
  tug: TugMemo | null
}

/** The tug read for one tile, kept while the ground, the planet and the vehicle stay the same. */
interface TugMemo {
  world: WorldState
  planet: AuthorityState['planet']
  vehicle: VehicleState
  tile: TilePoint
  isCutting: boolean
  /** Absent where no field pulls. */
  tug: Vector2 | undefined
}

export function createVehicleLoop(flags: DevFlags = DEV_FLAGS): VehicleLoop {
  const loop: LoopState = {
    stage: createVehicleStage(),
    reporter: NEW_POSE_REPORTER,
    placement: '',
    view: null,
    tile: { tx: 0, ty: 0 },
    isCutting: false,
    hasStepped: false,
    tug: null,
  }
  return {
    step(controller, intent) {
      useGameStore.getState().advanceOneTick()
      const { params, world } = readPlanetWorld()
      if (params === null) return
      const vehicle = readLocalVehicle()
      placeAfterTowOrTravel(loop, controller, vehicle, params)
      const stagedIntent = loop.stage.step(intent)
      const result = controller.step(
        {
          intent: stagedIntent,
          engine: engineOf(flags, vehicle),
          canAct: canVehicleAct(vehicle),
          motion: readLocalMotion(),
          tug: readLocalTug(loop),
          drillContactRule: drillContactRuleOf(flags),
          cutFollowOf: cutFollowRuleOf(flags),
          stepBounds: stepBoundsOfFlag(flags),
          struts: strutsOf(readAuthorityState()),
        },
        planetViewOf(loop, params, world),
      )
      noteBodyStep(loop, result)
      stepDrillWhenSwept(flags, result, stagedIntent)
      reportWhenDue(loop, result, stagedIntent)
      syncGroundToTickWorld(flags, loop, controller)
      showDrill(result)
      showMotion(result)
      stepVehicleParts(result.pose, result.flags)
      renderPresence.groundColliders = controller.colliderCount()
    },
  }
}

/** The slices' motion effects on the local vehicle at the authority's tick (ticket 233). */
function readLocalMotion(): VehicleMotion {
  const state = readAuthorityState()
  return vehicleMotionAt(state, useGameStore.getState().playerId, state.tick)
}

/** The field's tug on the local vehicle where the body stood, and as it cut, after the last step. */
function readLocalTug(loop: LoopState): Vector2 | undefined {
  const state = readAuthorityState()
  const playerId = useGameStore.getState().playerId
  if (!loop.hasStepped) return undefined
  if (isTugMemoFresh(loop.tug, state, playerId, loop)) return loop.tug.tug
  const tile = { tx: loop.tile.tx, ty: loop.tile.ty }
  const readTug = loop.isCutting ? magneticTugOnCutAt : magneticTugAt
  const tug = readTug(state, playerId, tile) ?? undefined
  const vehicle = state.players[playerId].vehicle
  loop.tug = {
    world: state.world,
    planet: state.planet,
    vehicle,
    tile,
    isCutting: loop.isCutting,
    tug,
  }
  return tug
}

function noteBodyStep(loop: LoopState, result: VehicleStepResult): void {
  loop.tile.tx = Math.floor(result.pose.x / MM_PER_METRE)
  loop.tile.ty = Math.floor(result.pose.y / MM_PER_METRE)
  loop.isCutting = result.flags.isDrilling
  loop.hasStepped = true
}

function isTugMemoFresh(
  memo: TugMemo | null,
  state: AuthorityState,
  playerId: string,
  loop: LoopState,
): memo is TugMemo {
  if (memo === null) return false
  return (
    memo.world === state.world &&
    memo.planet === state.planet &&
    memo.vehicle === state.players[playerId].vehicle &&
    memo.tile.tx === loop.tile.tx &&
    memo.tile.ty === loop.tile.ty &&
    memo.isCutting === loop.isCutting
  )
}

/** A stranded or empty vehicle neither drives, lifts nor drills (#7). */
function canVehicleAct(vehicle: VehicleState): boolean {
  return vehicle.mode === 'active' && vehicle.energy > 0
}

function placeAfterTowOrTravel(
  loop: LoopState,
  controller: VehicleController,
  vehicle: VehicleState,
  params: PlanetParams,
): void {
  const placement = placementOf(vehicle, params)
  if (placement === loop.placement || vehicle.pose === null) return
  loop.placement = placement
  loop.reporter = NEW_POSE_REPORTER
  controller.placeAt(vehicle.pose)
  motionPresence.placements += 1
}

/** Changes when the vehicle is towed to the dock or the planet changes under it. */
function placementOf(vehicle: VehicleState, params: PlanetParams): string {
  const dockedSince = vehicle.mode === 'docked' ? vehicle.modeSinceTick : 'free'
  return `${params.worldSeed}:${params.planetIndex}:${dockedSince}`
}

/** One view per world state, so the halo looks for changed chunks only when the world moved on. */
function planetViewOf(loop: LoopState, params: PlanetParams, world: WorldState): PlanetView {
  if (loop.view?.world === world && loop.view.params === params) return loop.view.planet
  const planet: PlanetView = {
    radiusTiles: params.radiusTiles,
    gravityMultiplier: params.gravityMultiplier,
    worldVersion: world,
    ground: groundReaderOf(world, params),
    chunkVersion: (cx, cy) => world.chunks[chunkKey(cx, cy)],
  }
  loop.view = { world, params, planet }
  return planet
}

/** Hands the step's facing and drilling to the scene's headlamp and sparks. */
function showDrill(result: VehicleStepResult): void {
  const { pose, flags } = result
  const nose = noseTileOf(pose)
  drillPresence.facing = pose.facing
  drillPresence.isDrilling = flags.isDrilling
  drillPresence.up.x = pose.upx / UP_VECTOR_SCALE
  drillPresence.up.y = pose.upy / UP_VECTOR_SCALE
  const ahead = facingVectorOf(pose.upx, pose.upy, pose.facing)
  drillPresence.ahead.x = ahead.x / UP_VECTOR_SCALE
  drillPresence.ahead.y = ahead.y / UP_VECTOR_SCALE
  drillPresence.nose.x = nose.tx + HALF_TILE
  drillPresence.nose.y = nose.ty + HALF_TILE
}

/** Hands the step's speed and lift to the sound stage, its velocity to the terrain's streaming. */
function showMotion(result: VehicleStepResult): void {
  const { vx, vy } = result.pose
  motionPresence.speedMetresPerSecond = Math.sqrt(vx * vx + vy * vy) / MM_PER_METRE
  motionPresence.velocity.x = vx / MM_PER_METRE
  motionPresence.velocity.y = vy / MM_PER_METRE
  motionPresence.isLifting = result.flags.isThrusting
}

/**
 * The drill also bites on part-cut ground past the face: with the swept cut on (ticket 330), and
 * with it off on a level cut, where a lip there dead-stopped the body (ticket 516).
 */
function drillContactRuleOf(flags: DevFlags): DrillContactRule {
  return flags['drill.sweptCut'] ? sweptDrillContactOf : levelSliverDrillContactOf
}

/** With the swept cut on, travel parity's top speed (ticket 333); else the engine's own. */
function engineOf(flags: DevFlags, vehicle: VehicleState): EngineStats {
  if (!flags['drill.sweptCut']) return engineStatsAtStep(vehicle.levels.engine)
  return travelEngineAt(readAuthorityState(), useGameStore.getState().playerId)
}

/** With the swept cut on, the motor reads the cut gate and `vCut` before the cut (ticket 333). */
function cutFollowRuleOf(flags: DevFlags): ((step: CutFollowStep) => CutFollow) | undefined {
  return flags['drill.sweptCut'] ? readLocalCutFollow : undefined
}

/** With the swept cut on, the rig's step bounds as the authority checks its steps (ticket 334). */
function stepBoundsOfFlag(flags: DevFlags): StepBounds | undefined {
  if (!flags['drill.sweptCut']) return undefined
  return stepBoundsAt(readAuthorityState(), useGameStore.getState().playerId)
}

function readLocalCutFollow(step: CutFollowStep): CutFollow {
  return cutFollowAt(readAuthorityState(), useGameStore.getState().playerId, step)
}

/** The swept cut's step: the body's position at every step its drill is engaged (ticket 330). */
function stepDrillWhenSwept(flags: DevFlags, result: VehicleStepResult, intent: VehicleIntent) {
  if (!flags['drill.sweptCut'] || !result.flags.isDrilling) return
  useGameStore.getState().stepDrill(drillStepCommand(result.pose, driveSignsOfIntent(intent)))
}

/**
 * With the swept cut on, the ground the tick's substeps collide with is the world the tick's own
 * cut and report left (ticket 459): the step read the world before them, and the cut has opened
 * ground there since. A report can change the world too (a casing placed), so the sync comes last.
 */
function syncGroundToTickWorld(flags: DevFlags, loop: LoopState, controller: VehicleController) {
  if (!flags['drill.sweptCut']) return
  const { params, world } = readPlanetWorld()
  if (params !== null) controller.syncGround(planetViewOf(loop, params, world))
}

function reportWhenDue(loop: LoopState, result: VehicleStepResult, intent: VehicleIntent): void {
  const counted = countActionStep(loop.reporter, result.flags)
  const moment = { flags: result.flags, drive: driveSignsOfIntent(intent) }
  const report = takePoseReport(counted, result.pose, moment, readAuthorityTick())
  loop.reporter = report.reporter
  if (report.payload !== null) useGameStore.getState().reportPose(report.payload)
}
