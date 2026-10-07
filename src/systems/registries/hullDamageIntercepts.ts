/**
 * Slice intercepts on hull damage (ticket 233, the GD lock on #204 Q1 b): a steam shield's window
 * scales an enemy's hit and a collapse's crush. Each intercept answers a scale in basis points
 * (null when it has nothing to say); the kernel multiplies them and never lets the hit fall below
 * `itemEffectCaps.damageFloorBp` (50%) of the base. Heat, lava and a charge's own blast are never
 * asked. With nothing registered every hit is what it was.
 */
import { BASIS_POINTS } from '../../constants/balance'
import type { AuthorityState } from '../authority/authorityState'
import type { DamageSource } from '../authority/domainEvent'
import { ECONOMY } from '../economy/economy'
import { flooredScaleBp } from '../economy/itemEffectCaps'
import { div, fromSafeInteger, mul, type BigStat } from '../money'
import { defineRegistry, entriesOf } from './seal'

/** The damage an intercept is asked about: an enemy's hit, or a collapse's crush. */
export type InterceptedDamageSource = Extract<DamageSource, 'drill-contact enemy' | 'collapse'>

export interface HullDamageIntercept {
  id: string
  /** The share of the hit the vehicle takes, in basis points; null to leave it alone. */
  damageScaleBpOf(
    state: AuthorityState,
    playerId: string,
    source: InterceptedDamageSource,
    tick: number,
  ): number | null
}

export const HULL_DAMAGE_INTERCEPT_REGISTRY =
  defineRegistry<HullDamageIntercept>('hullDamageIntercepts')

/** The hit after every registered intercept, never below the floor share of `base`. */
export function interceptedHullDamage(
  state: AuthorityState,
  playerId: string,
  source: InterceptedDamageSource,
  tick: number,
  base: BigStat,
): BigStat {
  const scales = damageScalesOf(state, playerId, source, tick)
  if (scales.length === 0) return base
  const scaleBp = flooredScaleBp(scales, ECONOMY.itemEffectCaps.damageFloorBp)
  return div(mul(base, fromSafeInteger(scaleBp)), fromSafeInteger(BASIS_POINTS))
}

function damageScalesOf(
  state: AuthorityState,
  playerId: string,
  source: InterceptedDamageSource,
  tick: number,
): number[] {
  return entriesOf(HULL_DAMAGE_INTERCEPT_REGISTRY)
    .map((intercept) => intercept.damageScaleBpOf(state, playerId, source, tick))
    .filter((scale): scale is number => scale !== null)
}
