/**
 * The `bandOre` price family (#105 travel-fee shape, used by the refinery slots, the gun mount and
 * levels #107, and the blasting charges #109): `oreUnits` of band `band`'s ore at the planet it is
 * paid on, `oreUnits * V(t(p, band)) * paceScale(p)`, so a price keeps its weight on any planet.
 *
 * The `...At` pair splits the planet in two (#165 Q3 lock, ticket 211): the ore is worth what it is
 * on `worthPlanet`, and `paceScale` is read once, on `pacePlanet`. A tech node passes its unlock
 * planet as both, so buying it later never re-reads `paceScale` and is never cheaper (#161).
 */
import { ceilMilli, mul, type Money } from '../money'
import type { BandOreCost } from './economyDefinition'
import { oreTier, oreValue } from './oreEconomy'
import { paceScale } from './planetEconomy'

/** Worth of `cost` priced in `worthPlanet`'s ore, with `paceScale` taken from `pacePlanet`. */
export function bandOreWorthAt(
  { band, oreUnits }: BandOreCost,
  worthPlanet: number,
  pacePlanet: number,
): Money {
  return mul(mul(oreUnits, oreValue(oreTier(worthPlanet, band))), paceScale(pacePlanet))
}

export function bandOrePriceAt(cost: BandOreCost, worthPlanet: number, pacePlanet: number): Money {
  return ceilMilli(bandOreWorthAt(cost, worthPlanet, pacePlanet))
}

/** The price unrounded, for a caller that multiplies it before rounding once. */
export function bandOreWorth(cost: BandOreCost, planetIndex: number): Money {
  return bandOreWorthAt(cost, planetIndex, planetIndex)
}

export function bandOrePrice(cost: BandOreCost, planetIndex: number): Money {
  return bandOrePriceAt(cost, planetIndex, planetIndex)
}
