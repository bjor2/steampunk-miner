/**
 * The vehicle as an enemy sees it at a tick (#9): where it is (the last report carried on for at
 * most 12 ticks), which way its drill points, and whether it is out on a trip. An active or
 * stranded vehicle can be hunted and hit; a docked or destroyed one cannot.
 */
import type { VehiclePose } from '../../vehicle/vehiclePose'
import type { VehicleState } from '../../vehicle/vehicleState'
import { vehicleOf, type AuthorityState } from '../authorityState'
import { vehiclePositionAt, type MillimetrePoint } from './combatGeometry'
import { combatVehicleOf } from './combatState'

export interface VehicleTarget {
  playerId: string
  pose: VehiclePose
  position: MillimetrePoint
}

/** Null when the vehicle has no pose or is not out on a trip. */
export function vehicleTargetOf(
  state: AuthorityState,
  playerId: string,
  tick: number,
): VehicleTarget | null {
  const vehicle = vehicleOf(state, playerId)
  if (vehicle.pose === null || !isOnTrip(vehicle)) return null
  const { reportTick } = combatVehicleOf(state.combat, playerId)
  return {
    playerId,
    pose: vehicle.pose,
    position: vehiclePositionAt(vehicle.pose, reportTick, tick),
  }
}

export function isOnTrip(vehicle: VehicleState): boolean {
  return vehicle.mode === 'active' || vehicle.mode === 'stranded'
}
