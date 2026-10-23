/**
 * What a star-map jump burns and what its fuel costs (ticket 755), provisional until Systems' fuel
 * curve and tank (ticket 756) put the hop's price on the destination's economy (VS on #650):
 *
 *   fuel(a -> b)        = unitsPerPlanetStep * |b - a|      (`starMap.fuel` in economy.json)
 *   fuel unit on planet p = travelFee(p)
 *
 * so one unit bought on planet p pays exactly today's hop from it, and the step to the next planet
 * costs what `Travel` charges before its clamp. Fuel is bought with money and never mined (GD lock,
 * comment 6361556890); it is a BigStat, since the tank has no cap.
 */
import { ceilMilli, fromSafeInteger, mul, type BigStat, type Money } from '../money'
import { ECONOMY } from './economy'
import { travelFee } from './planetCharges'

/** The fuel units a jump from planet `fromPlanet` to planet `toPlanet` of one system burns. */
export function jumpFuelUnitsOf(fromPlanet: number, toPlanet: number): BigStat {
  const planetSteps = Math.abs(toPlanet - fromPlanet)
  return fromSafeInteger(ECONOMY.starMap.fuel.unitsPerPlanetStep * planetSteps)
}

/** One fuel unit at the shop of planet `planetIndex` (60.75 on planet 1). */
export function fuelUnitPriceOf(planetIndex: number): Money {
  return travelFee(planetIndex)
}

/** `units` whole fuel units at the shop of planet `planetIndex`. */
export function fuelPriceOf(planetIndex: number, units: number): Money {
  return ceilMilli(mul(fuelUnitPriceOf(planetIndex), fromSafeInteger(units)))
}
