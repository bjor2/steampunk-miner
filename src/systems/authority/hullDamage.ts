/**
 * Hull damage no enemy dealt (#43 collapse crush, #109 a charge's own blast): it goes through the
 * same hull path as an enemy's hit, `VehicleDamaged` with no enemy, arc, kind or tier, and the hull
 * stops at 0. The caller then lets `destroyIfHullGone` wreck the vehicle with its own cause.
 */
import { cmp, sub, toCanonical, ZERO_MONEY, type BigStat } from '../money'
import { vehicleOf, withVehicle, type AuthorityState } from './authorityState'
import type { RuleEffect } from './commandRule'
import type { DamageSource } from './domainEvent'

export function damageHullBy(
  state: AuthorityState,
  playerId: string,
  amount: BigStat,
  source: Exclude<DamageSource, 'drill-contact enemy'>,
): RuleEffect {
  const vehicle = vehicleOf(state, playerId)
  const hullAfter = atLeastZero(sub(vehicle.hull, amount))
  return {
    state: withVehicle(state, playerId, { ...vehicle, hull: hullAfter }),
    events: [
      {
        type: 'VehicleDamaged',
        amount: toCanonical(amount),
        source,
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
