/**
 * A collapse's crush (decision #43 Vehicle safety, S3 defaults 3 and 5): a vehicle whose clearance
 * circle reaches a refilling block's carved air takes `collapseCrush` of its hull once per refill,
 * through the same hull path as an enemy's hit: `VehicleDamaged` with `source: 'collapse'` and no
 * enemy, and at 0 hull `vehicle_destroyed {cause: collapse}`, after which the ordinary tow follows
 * (`rescue_triggered.cause` stays `destroyed`). Only an active or stranded vehicle can be crushed.
 */
import { collapseCrushDamage } from '../../economy/collapseCrush'
import { statsOfVehicle, type VehicleState } from '../../vehicle/vehicleState'
import { vehicleOf, type AuthorityState } from '../authorityState'
import { chainEffects, unchanged, type RuleEffect } from '../commandRule'
import { damageHullBy } from '../hullDamage'
import { destroyIfHullGone } from '../vehicleTransitions'

export function isCrushable(vehicle: VehicleState): boolean {
  return vehicle.mode === 'active' || vehicle.mode === 'stranded'
}

/** `band` is where the collapsing block sits: 1 to 5, or the core's band. */
export function crushVehicle(
  state: AuthorityState,
  playerId: string,
  band: number,
  tick: number,
): RuleEffect {
  if (!isCrushable(vehicleOf(state, playerId))) return unchanged(state)
  return chainEffects(state, [
    (current) => takeCrush(current, playerId, band),
    (current) => destroyIfHullGone(current, playerId, tick, 'collapse'),
  ])
}

function takeCrush(state: AuthorityState, playerId: string, band: number): RuleEffect {
  const hullMax = statsOfVehicle(vehicleOf(state, playerId)).hullMax
  return damageHullBy(state, playerId, collapseCrushDamage(band, hullMax), 'collapse')
}
