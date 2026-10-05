/**
 * The live game's fixed step for the local vehicle (#3, #11): the authority's clock moves one
 * tick, the controller drives the body for that tick with the current intent, the step's actions
 * are counted, and a pose report goes to the authority when one is due. After the tow or a planet
 * change the body is placed on the dock the authority put the vehicle on.
 */
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
import type { VehicleState } from '../systems/vehicle/vehicleState'
import type { PlanetParams } from '../systems/world/planetParams'
import { cellAt, type WorldState } from '../systems/world/worldState'

export interface VehicleLoop {
  step(controller: VehicleController, intent: VehicleIntent): void
}

interface LoopState {
  reporter: PoseReporter
  placement: string
  view: { world: WorldState; params: PlanetParams; planet: PlanetView } | null
}

export function createVehicleLoop(): VehicleLoop {
  const loop: LoopState = { reporter: NEW_POSE_REPORTER, placement: '', view: null }
  return {
    step(controller, intent) {
      useGameStore.getState().advanceOneTick()
      const { params, world } = readPlanetWorld()
      if (params === null) return
      const vehicle = readLocalVehicle()
      placeAfterTowOrTravel(loop, controller, vehicle, params)
      const result = controller.step(
        { intent, engine: engineStats(vehicle.levels.engine), canAct: canVehicleAct(vehicle) },
        planetViewOf(loop, params, world),
      )
      reportWhenDue(loop, result)
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

/** One view per world state, so the halo rebuilds only when a tile actually changed. */
function planetViewOf(loop: LoopState, params: PlanetParams, world: WorldState): PlanetView {
  if (loop.view?.world === world && loop.view.params === params) return loop.view.planet
  const planet: PlanetView = {
    radiusTiles: params.radiusTiles,
    gravityMultiplier: params.gravityMultiplier,
    worldVersion: world,
    cellAt: (tile) => cellAt(world, params, tile),
  }
  loop.view = { world, params, planet }
  return planet
}

function reportWhenDue(loop: LoopState, result: VehicleStepResult): void {
  const counted = countActionStep(loop.reporter, result.flags)
  const report = takePoseReport(counted, result.pose, result.flags, readAuthorityTick())
  loop.reporter = report.reporter
  if (report.payload !== null) useGameStore.getState().reportPose(report.payload)
}
