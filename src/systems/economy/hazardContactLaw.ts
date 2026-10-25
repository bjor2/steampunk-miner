/**
 * What a hazard contact takes (ticket 848; the GD lock on #823 Q1, the VS's input 6388806602):
 * crush, bite and scald are on the hull law at g, the curve enemy contact uses, never on V(t). A
 * hit is a basis-point share of the planet's on-curve hull (`onCurveHullShareOf`), so the owned
 * hull track still lowers the felt hit, and the share is weighed by the arc the cell lies in with
 * enemy contact's multipliers (#9: front 0.25, side 1, rear 2), so a frontal hit takes less than a
 * side or rear one. A dive's contacts never take more than the row's dive cap in all.
 */
import { BASIS_POINTS } from '../../constants/balance'
import { floor, fromSafeInteger, mul, toSafeInteger, type BigStat } from '../money'
import { ECONOMY } from './economy'
import type { HitArc } from './economyDefinition'
import { onCurveHullShareOf } from './magneticHazard'

/** The share of the on-curve hull one contact takes, in bp, after the dive's `takenBp`. */
export function hazardHitBp(
  shareBp: number,
  arc: HitArc,
  takenBp: number,
  diveHullCapBp: number,
): number {
  const weighed = Math.floor((shareBp * arcShareBp(arc)) / BASIS_POINTS)
  return Math.max(0, Math.min(weighed, diveHullCapBp - takenBp))
}

/** `hitBp` of the on-curve hull at campaign index `planetIndex`. */
export function hazardHullOf(planetIndex: number, hitBp: number): BigStat {
  return onCurveHullShareOf(planetIndex, hitBp)
}

/** Enemy contact's arc multiplier in bp: 2500, 10000 or 20000 as shipped. */
export function arcShareBp(arc: HitArc): number {
  const { kFrontPlayer, kSidePlayer, kRearPlayer } = ECONOMY.enemies.combat
  const multiplier = arc === 'front' ? kFrontPlayer : arc === 'side' ? kSidePlayer : kRearPlayer
  return toSafeInteger(floor(mul(multiplier, fromSafeInteger(BASIS_POINTS))))
}
