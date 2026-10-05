/**
 * An enemy's hit on the vehicle (decision #9 "The drill-contact rule"):
 *
 * - The zone is the three-zone arc from the latest report's facing and the vehicle's position at
 *   the tick. Doubt favours the player: within 12 ticks of the latest report, an enemy that was in
 *   the front zone at that report, or at the report before it when that one came at most 12 ticks
 *   earlier, counts as front. Swivelling away just before a hit lands therefore never turns a front
 *   hit into a side one.
 * - Front takes 0.25, side 1 and rear 2 times the enemy's base hit off the hull, never below 0.
 * - After any damaging hit the vehicle takes nothing for `hitGraceTicks` (20), so two enemies
 *   cannot chain a death in one tick.
 * - Hull at 0 destroys the vehicle with the hitter's kind, tier and arc; the #8 tow follows.
 */
import { COMBAT_EXTRAPOLATION_TICKS } from '../../../constants/balance'
import { ECONOMY } from '../../economy/economy'
import { enemyHitOnVehicle } from '../../economy/enemyStats'
import { cmp, sub, toCanonical, ZERO_MONEY, type BigStat } from '../../money'
import { vehicleOf, withCombat, withVehicle, type AuthorityState } from '../authorityState'
import { chainEffects, unchanged, type RuleEffect } from '../commandRule'
import { destroyIfHullGone } from '../vehicleTransitions'
import {
  combatVehicleOf,
  withCombatVehicle,
  type CombatVehicle,
  type Enemy,
  type HitArc,
} from './combatState'
import { hitArcOf } from './hitArc'
import type { VehicleTarget } from './vehicleTarget'

const { hitGraceTicks } = ECONOMY.enemies.combat

export function contactArcOf(
  state: AuthorityState,
  target: VehicleTarget,
  enemy: Enemy,
  tick: number,
): HitArc {
  const arc = hitArcOf(target.pose, enemy.x - target.position.x, enemy.y - target.position.y)
  if (arc === 'front') return arc
  return wasFrontAtRecentReport(combatVehicleOf(state.combat, target.playerId), enemy, tick)
    ? 'front'
    : arc
}

export function strikeVehicle(
  state: AuthorityState,
  enemy: Enemy,
  arc: HitArc,
  tick: number,
): RuleEffect {
  if (isInHitGrace(combatVehicleOf(state.combat, enemy.ownerId), tick)) return unchanged(state)
  return chainEffects(state, [
    (current) => takeHit(current, enemy, enemyHitOnVehicle(enemy.kind, enemy.tier, arc), arc, tick),
    (current) =>
      destroyIfHullGone(current, enemy.ownerId, tick, 'enemy', {
        kind: enemy.kind,
        tier: enemy.tier,
        arc,
      }),
  ])
}

function wasFrontAtRecentReport(vehicle: CombatVehicle, enemy: Enemy, tick: number): boolean {
  if (tick - vehicle.reportTick > COMBAT_EXTRAPOLATION_TICKS) return false
  return vehicle.frontAtReport.includes(enemy.id) || wasFrontAtPreviousReport(vehicle, enemy)
}

function wasFrontAtPreviousReport(vehicle: CombatVehicle, enemy: Enemy): boolean {
  const isRecent = vehicle.reportTick - vehicle.previousReportTick <= COMBAT_EXTRAPOLATION_TICKS
  return isRecent && vehicle.frontAtPreviousReport.includes(enemy.id)
}

function isInHitGrace(vehicle: CombatVehicle, tick: number): boolean {
  return vehicle.lastHitTick !== null && tick - vehicle.lastHitTick < hitGraceTicks
}

function takeHit(
  state: AuthorityState,
  enemy: Enemy,
  amount: BigStat,
  arc: HitArc,
  tick: number,
): RuleEffect {
  const vehicle = vehicleOf(state, enemy.ownerId)
  const hullAfter = atLeastZero(sub(vehicle.hull, amount))
  const hit = withVehicle(state, enemy.ownerId, { ...vehicle, hull: hullAfter })
  return {
    state: withCombat(hit, withCombatVehicle(hit.combat, enemy.ownerId, { lastHitTick: tick })),
    events: [
      {
        type: 'VehicleDamaged',
        amount: toCanonical(amount),
        arc,
        enemyId: enemy.id,
        kind: enemy.kind,
        tier: enemy.tier,
        hullAfter: toCanonical(hullAfter),
      },
    ],
  }
}

function atLeastZero(amount: BigStat): BigStat {
  return cmp(amount, ZERO_MONEY) < 0 ? ZERO_MONEY : amount
}
