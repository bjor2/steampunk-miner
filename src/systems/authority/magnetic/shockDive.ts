/**
 * A dive's shock count (spec #258, ticket 290): the vehicle's `shockHullBp` holds what electrified
 * cells took of the on-curve hull since it left the dock, held to the dive cap
 * (`electrifiedShock.ts`). Docking, or the tow that docks it, ends the dive, and the count is left
 * out again, so a vehicle no shock touched digests as it always did.
 */
import type { VehicleMode } from '../../vehicle/vehicleState'
import { vehicleOf, withVehicle, type AuthorityState } from '../authorityState'
import { unchanged, type RuleEffect } from '../commandRule'

export function endShockDiveOnDock(
  state: AuthorityState,
  playerId: string,
  to: VehicleMode,
): RuleEffect {
  const vehicle = vehicleOf(state, playerId)
  if (to !== 'docked' || vehicle.shockHullBp === undefined) return unchanged(state)
  const { shockHullBp: _ended, ...rest } = vehicle
  return unchanged(withVehicle(state, playerId, rest))
}
