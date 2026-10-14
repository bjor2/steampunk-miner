/**
 * The vehicle as an enemy sees it at a tick (#9): where it is (the last report carried on for at
 * most 12 ticks), which way its drill points, and whether it is out on a trip. An active or
 * stranded vehicle can be hunted and hit; a docked or destroyed one cannot.
 *
 * With the swept cut a drill step every tick says where the rig is (TD scope a on #316, ticket
 * 334): a step later than the report places it instead, carried on from the step's tick, so a rig
 * that stops or turns at speed is never misplaced by up to a report interval of travel.
 */
import type { SweptCut } from '../../vehicle/sweptCut'
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
    position: latestPositionAt(vehicle.pose, vehicle.sweptCut, reportTick, tick),
  }
}

/** The report's position carried on, or a later drill step's, carried on from its own tick. */
function latestPositionAt(
  pose: VehiclePose,
  cursor: SweptCut | undefined,
  reportTick: number,
  tick: number,
): MillimetrePoint {
  if (cursor === undefined || cursor.tick <= reportTick) {
    return vehiclePositionAt(pose, reportTick, tick)
  }
  return vehiclePositionAt({ ...pose, x: cursor.poseXMm, y: cursor.poseYMm }, cursor.tick, tick)
}

export function isOnTrip(vehicle: VehicleState): boolean {
  return vehicle.mode === 'active' || vehicle.mode === 'stranded'
}
