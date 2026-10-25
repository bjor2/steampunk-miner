/**
 * A dive's hazard state (ticket 848): the hull its contacts took (`hazardHullBp`, held to the
 * hazard caps' dive cap), a vent's shove still running and the tools acting. Docking, or the tow
 * that docks the rig, ends the dive: the tally and the shove are left out again and every acting
 * tool stops, so no trade-off outlives the dive and a rig no hazard touched digests as before.
 */
import type { VehicleMode, VehicleState } from '../../vehicle/vehicleState'
import { vehicleOf, withVehicle, type AuthorityState } from '../authorityState'
import { unchanged, type RuleEffect } from '../commandRule'
import { stopEveryToolActing } from './toolActing'

export function endHazardDiveOnDock(
  state: AuthorityState,
  playerId: string,
  to: VehicleMode,
): RuleEffect {
  if (to !== 'docked') return unchanged(state)
  const stopped = stopEveryToolActing(state, playerId)
  const vehicle = vehicleOf(stopped.state, playerId)
  return {
    state: withVehicle(stopped.state, playerId, withoutDiveHazards(vehicle)),
    events: stopped.events,
  }
}

/** The vehicle with no hazard tally and no shove; the vehicle itself when it holds neither. */
export function withoutDiveHazards(vehicle: VehicleState): VehicleState {
  if (vehicle.hazardHullBp === undefined && vehicle.hazardShove === undefined) return vehicle
  const { hazardHullBp: _tally, hazardShove: _shove, ...rest } = vehicle
  return rest
}
