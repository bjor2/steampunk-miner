/**
 * A collapse's crush (decision #43 Vehicle safety, S3 defaults 3 and 5): a vehicle whose clearance
 * circle reaches a refilling block's carved air takes `collapseCrush` of its hull once per refill,
 * through the same hull path as an enemy's hit: `VehicleDamaged` with `source: 'collapse'` and no
 * enemy, and at 0 hull `vehicle_destroyed {cause: collapse}`, after which the ordinary tow follows
 * (`rescue_triggered.cause` stays `destroyed`). Only an active or stranded vehicle can be crushed.
 */
import { collapseCrushDamage } from '../../economy/collapseCrush'
import { cmp, sub, toCanonical, ZERO_MONEY, type BigStat } from '../../money'
import { statsOfVehicle, type VehicleState } from '../../vehicle/vehicleState'
import { vehicleOf, withVehicle, type AuthorityState } from '../authorityState'
import { chainEffects, unchanged, type RuleEffect } from '../commandRule'
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
  const vehicle = vehicleOf(state, playerId)
  const amount = collapseCrushDamage(band, statsOfVehicle(vehicle).hullMax)
  const hullAfter = atLeastZero(sub(vehicle.hull, amount))
  return {
    state: withVehicle(state, playerId, { ...vehicle, hull: hullAfter }),
    events: [
      {
        type: 'VehicleDamaged',
        amount: toCanonical(amount),
        source: 'collapse',
        arc: null,
        enemyId: null,
        kind: null,
        tier: null,
        hullAfter: toCanonical(hullAfter),
      },
    ],
  }
}

function atLeastZero(amount: BigStat): BigStat {
  return cmp(amount, ZERO_MONEY) < 0 ? ZERO_MONEY : amount
}
