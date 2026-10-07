/**
 * What `hazard:magnetic` costs on a planet (GD lock on spec #258 Q2, ticket 290): the
 * `magneticHazard` caps (`magneticHazardCaps.ts`) read against the planet's on-curve tracks, so
 * the tug, the sensing cut and the shocks weigh the same share of a run on every magnetic planet
 * whatever the player bought.
 */
import { BASIS_POINTS } from '../../constants/balance'
import { div, fromSafeInteger, mul, type BigStat } from '../money'
import { ECONOMY } from './economy'
import { onCurveSteps, vehicleStatsAt } from './vehicleStats'

/** m/s: a field's tug at the planet, its share of the on-curve top speed under the #233 cap. */
export function tugSpeedAt(planetIndex: number): number {
  const shareBp = Math.min(
    ECONOMY.magneticHazard.tugShareOfEngineBp,
    ECONOMY.itemEffectCaps.motionBoostCapBp,
  )
  return (vehicleStatsAt(onCurveSteps(planetIndex)).engine.speedMax * shareBp) / BASIS_POINTS
}

/** Whole tiles a sensing reach of `baseTiles` keeps inside a field, rounded up. */
export function reachInFieldOf(baseTiles: number): number {
  return Math.ceil((baseTiles * ECONOMY.magneticHazard.sensingReachShareBp) / BASIS_POINTS)
}

/** Ticks one shock adds to an electrified cell's drill time. */
export function shockTicks(): number {
  return ECONOMY.magneticHazard.shockTicks
}

/** The on-curve hull share the next shock costs, after `takenBp` this dive: never past the cap. */
export function shockHullBpAfter(takenBp: number): number {
  const { shockHullShareBp, diveHullCapBp } = ECONOMY.magneticHazard
  return Math.max(0, Math.min(shockHullShareBp, diveHullCapBp - takenBp))
}

/** `hullBp` of the on-curve hull at the planet. */
export function onCurveHullShareOf(planetIndex: number, hullBp: number): BigStat {
  const { hullMax } = vehicleStatsAt(onCurveSteps(planetIndex))
  return div(mul(hullMax, fromSafeInteger(hullBp)), fromSafeInteger(BASIS_POINTS))
}
