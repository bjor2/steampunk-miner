/**
 * The local vehicle's staging at a dock building, once per fixed step (#170 Workshop auto-roll):
 * the slice's provider says where the car is drawn and where the camera looks, which this hands
 * to the scene through `vehicleStagePresence`; while it holds input the step drives with the idle
 * intent; and where it allows, a drive key held for 15 ticks undocks. The authority pose and the
 * body are never moved, so a replay is the same with or without staging.
 */
import { readAuthorityState } from '../store/authorityLink'
import { useGameStore } from '../store/gameStore'
import { isDriveKeyHeld } from '../store/inputRuntime'
import {
  DRIVE_HOLD_LEAVE_TICKS,
  vehicleStagingOf,
  type VehicleStaging,
} from '../systems/registries/vehicleStaging'
import { IDLE_INTENT, type VehicleIntent } from '../systems/vehicle/vehicleIntent'

/** Written once per fixed step; read each frame by `VehicleBody` and `PlanetCamera`. */
export const vehicleStagePresence = {
  drawOffsetX: 0,
  drawOffsetY: 0,
  cameraX: 0,
  cameraY: 0,
  cameraWeight: 0,
}

export interface VehicleStage {
  /** The intent the step drives with, after the staging had its say. */
  step(intent: VehicleIntent): VehicleIntent
}

export function createVehicleStage(): VehicleStage {
  const hold = { ticks: 0 }
  return {
    step(intent) {
      const staging = stagingNow()
      showStaging(staging)
      leaveOnDriveHold(hold, staging)
      return staging?.isHoldingInput === true ? IDLE_INTENT : intent
    },
  }
}

function stagingNow(): VehicleStaging | null {
  return vehicleStagingOf(readAuthorityState(), useGameStore.getState().playerId)
}

function showStaging(staging: VehicleStaging | null): void {
  vehicleStagePresence.drawOffsetX = staging?.drawOffsetX ?? 0
  vehicleStagePresence.drawOffsetY = staging?.drawOffsetY ?? 0
  vehicleStagePresence.cameraX = staging?.cameraX ?? 0
  vehicleStagePresence.cameraY = staging?.cameraY ?? 0
  vehicleStagePresence.cameraWeight = staging?.cameraWeight ?? 0
}

/** Counts the steps a drive key stays held where staging allows it; the 15th undocks once. */
function leaveOnDriveHold(hold: { ticks: number }, staging: VehicleStaging | null): void {
  const isCounting = staging?.canLeaveByDriveHold === true && isDriveKeyHeld()
  hold.ticks = isCounting ? hold.ticks + 1 : 0
  if (hold.ticks === DRIVE_HOLD_LEAVE_TICKS) useGameStore.getState().undock()
}
