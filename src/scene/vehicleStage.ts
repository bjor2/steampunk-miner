/**
 * The local vehicle's staging at a dock building, once per fixed step (#170 Workshop auto-roll):
 * the slice's provider says where the car is drawn and where the camera looks, which this hands
 * to the scene through `vehicleStagePresence`; while it holds input the step drives with the idle
 * intent; and where it allows, a drive key held for 15 ticks undocks. The authority pose and the
 * body are never moved, so a replay is the same with or without staging. A slice may turn the
 * staged car (#180 turntable, K-b ticket 227) with `turnStagedVehicle`.
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
  /** The car's turn about its own up axis in radians (`VehicleStaging.rotation`). */
  rotation: 0,
}

/** The turn a slice last asked for; only this module reads it. */
const requestedTurn = { radians: 0 }

/**
 * Turns the staged car about its own up axis, from the next fixed step (#180: selecting a plaque
 * turns the turntable so its part faces the camera). The slice eases the turn and calls this once
 * per step; this only shows it. It adds to the provider's own `rotation`, counts only while a dock
 * building stages the car and is dropped when the staging ends, so the next visit starts as driven.
 */
export function turnStagedVehicle(radians: number): void {
  requestedTurn.radians = radians
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
      dropTurnWhenUnstaged(staging)
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
  vehicleStagePresence.rotation = staging === null ? 0 : stagedRotationOf(staging)
}

function stagedRotationOf(staging: VehicleStaging): number {
  return (staging.rotation ?? 0) + requestedTurn.radians
}

function dropTurnWhenUnstaged(staging: VehicleStaging | null): void {
  if (staging === null) requestedTurn.radians = 0
}

/** Counts the steps a drive key stays held where staging allows it; the 15th undocks once. */
function leaveOnDriveHold(hold: { ticks: number }, staging: VehicleStaging | null): void {
  const isCounting = staging?.canLeaveByDriveHold === true && isDriveKeyHeld()
  hold.ticks = isCounting ? hold.ticks + 1 : 0
  if (hold.ticks === DRIVE_HOLD_LEAVE_TICKS) useGameStore.getState().undock()
}
