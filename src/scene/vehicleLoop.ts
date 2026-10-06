/**
 * The live game's fixed step for the local vehicle (#3, #11): the authority's clock moves one
 * tick, the controller drives the body for that tick with the current intent, the step's actions
 * are counted, a pose report goes to the authority when one is due, the drill's facing and
 * activity go to the scene for the headlamp and sparks, the speed and lift to the sounds, and the
 * tick's motion to the part animation (#48). After the tow or a planet change the body
 * is placed on the dock the authority put the vehicle on. A dock building may stage the vehicle
 * first (#170 auto-roll, `vehicleStage.ts`): the drawn car and the camera move, the body does not.
 */
import { MM_PER_METRE, UP_VECTOR_SCALE } from '../constants/physics'
import type { PlanetView, VehicleController, VehicleStepResult } from '../physics/vehicleController'
import {
  readAuthorityTick,
  readLocalVehicle,
  readPlanetWorld,
  useGameStore,
} from '../store/gameStore'
import { engineStats } from '../systems/economy/vehicleStats'
import {
  countActionStep,
  NEW_POSE_REPORTER,
  takePoseReport,
  type PoseReporter,
} from '../systems/vehicle/poseReport'
import type { VehicleIntent } from '../systems/vehicle/vehicleIntent'
import { noseTileOf } from '../systems/vehicle/vehiclePose'
import type { VehicleState } from '../systems/vehicle/vehicleState'
import type { PlanetParams } from '../systems/world/planetParams'
import { groundReaderOf } from '../systems/world/groundReader'
import { chunkKey } from '../systems/world/tileGrid'
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
}

export function createVehicleLoop(): VehicleLoop {
  const loop: LoopState = {
    stage: createVehicleStage(),
    reporter: NEW_POSE_REPORTER,
    placement: '',
    view: null,
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
          engine: engineStats(vehicle.levels.engine),
          canAct: canVehicleAct(vehicle),
        },
        planetViewOf(loop, params, world),
      )
      reportWhenDue(loop, result)
      showDrill(result)
      showMotion(result)
      stepVehicleParts(result.pose, result.flags)
      renderPresence.groundColliders = controller.colliderCount()
    },
  }
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
  drillPresence.nose.x = nose.tx + HALF_TILE
  drillPresence.nose.y = nose.ty + HALF_TILE
}

/** Hands the step's speed and lift to the sound stage. */
function showMotion(result: VehicleStepResult): void {
  const { vx, vy } = result.pose
  motionPresence.speedMetresPerSecond = Math.sqrt(vx * vx + vy * vy) / MM_PER_METRE
  motionPresence.isLifting = result.flags.isThrusting
}

function reportWhenDue(loop: LoopState, result: VehicleStepResult): void {
  const counted = countActionStep(loop.reporter, result.flags)
  const report = takePoseReport(counted, result.pose, result.flags, readAuthorityTick())
  loop.reporter = report.reporter
  if (report.payload !== null) useGameStore.getState().reportPose(report.payload)
}
