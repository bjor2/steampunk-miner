/**
 * How a dock building stages the local vehicle (#170 Workshop auto-roll, TD: presentation only):
 * where the car is drawn relative to its body, where the camera looks and whether input waits.
 * Read once per fixed step from the authority state, so it is the same at any frame rate, and it
 * never enters the authority state, a snapshot or a digest: the body and the pose the client
 * reports stay where the vehicle stopped. One provider (the `dock-buildings` slice); with none,
 * nothing is staged. The car's turn on a turntable (#180, K-b ticket 227) is a kernel field: the
 * provider may set one, and a slice adds its own with `turnStagedVehicle` (`scene/vehicleStage.ts`).
 */
import type { AuthorityState } from '../authority/authorityState'
import { defineOneProviderRegistry, entriesOf } from './seal'

export interface VehicleStaging {
  /** Metres from the body to where the car is drawn. */
  drawOffsetX: number
  drawOffsetY: number
  /** Where the camera eases to, in world metres, and how far it has gone, 0 to 1. */
  cameraX: number
  cameraY: number
  cameraWeight: number
  /** While true the vehicle intent is idle: input is ignored during a roll. */
  isHoldingInput: boolean
  /** While true a drive key held for `DRIVE_HOLD_LEAVE_TICKS` undocks (#170 Workshop). */
  canLeaveByDriveHold: boolean
  /**
   * The car's turn about its own up axis in radians: 0 (or absent) as driven, π facing the other
   * way. Drawn only; the body never turns.
   */
  rotation?: number
}

export interface VehicleStagingProvider {
  id: string
  stagingOf(state: AuthorityState, playerId: string): VehicleStaging | null
}

/** #170 G&V: holding a drive key this long leaves the Workshop showcase. */
export const DRIVE_HOLD_LEAVE_TICKS = 15

export const VEHICLE_STAGING_REGISTRY =
  defineOneProviderRegistry<VehicleStagingProvider>('vehicleStaging')

/** The provider's staging now, or null: no provider, or nothing staged. */
export function vehicleStagingOf(state: AuthorityState, playerId: string): VehicleStaging | null {
  const [provider] = entriesOf(VEHICLE_STAGING_REGISTRY)
  return provider?.stagingOf(state, playerId) ?? null
}
