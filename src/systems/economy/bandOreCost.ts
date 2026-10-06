/**
 * The `bandOre` price family (#105 travel-fee shape, used by the refinery slots, the gun mount and
 * levels #107, and the blasting charges #109): `oreUnits` of band `band`'s ore at the planet it is
 * paid on, `oreUnits * V(t(p, band)) * paceScale(p)`, so a price keeps its weight on any planet.
 */
import { ceilMilli, mul, type Money } from '../money'
import type { BandOreCost } from './economyDefinition'
import { oreTier, oreValue } from './oreEconomy'
import { paceScale } from './planetEconomy'

/** The price unrounded, for a caller that multiplies it before rounding once. */
export function bandOreWorth({ band, oreUnits }: BandOreCost, planetIndex: number): Money {
  return mul(mul(oreUnits, oreValue(oreTier(planetIndex, band))), paceScale(planetIndex))
}

export function bandOrePrice(cost: BandOreCost, planetIndex: number): Money {
  return ceilMilli(bandOreWorth(cost, planetIndex))
}
