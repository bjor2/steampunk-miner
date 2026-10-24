/**
 * What a star-map jump burns and what its fuel costs: the Systems ruling on #756, reconciled with
 * the VS law and the GD lock on #650 (`starMapRules.ts` holds the data):
 *
 *   fuelUnits(a -> b) = max(1, ceil(U0 * (1 + 0.25 * |g_b - g_a|)))     whole units, J = 1 in a system
 *   unitPrice(g)      = kappa * R(g - 1)
 *   Fee(a -> b)       = fuelUnits(a -> b) * unitPrice(g_b)              so Fee(p -> p+1) = 0.5 * R(p)
 *
 * R(p), the median run sell value, is `runValue.oreUnits` ore units of planet p's top band until it
 * is measured, so a planet's fee is the VS ratio V(t_top(g)) / V(t_top(1)) = 3.375^(g-1) of the
 * first, computed with bignum `powInt` and finite at any safe-integer index (s = 1e6 included).
 *
 * Fuel is bought ahead and carried, so the shop of planet p sells it at the price of the hop on:
 * unitPrice(g_p + 1) = kappa * R(p). The hop to the next planet then pays exactly its fee, fuel
 * carried from an earlier planet was paid there, and a trip back burns the units it says on the map.
 * Fuel is never mined (GD lock, comment 6361556890).
 *
 * A jump between solar systems (ticket 759) is the same law times J, `starMap.systemJump`'s fuel
 * multiplier, once per jump: its distance is the campaign index's, which already counts every
 * planet of the systems between (#781), and it lands at the destination's unit price.
 */
import { add, ceil, ceilMilli, cmp, fromSafeInteger, mul, type BigStat, type Money } from '../money'
import { ECONOMY } from './economy'
import { oreTier, oreValue } from './oreEconomy'

const { fuel, systemJump } = ECONOMY.starMap
const ONE_UNIT = fromSafeInteger(1)

/** The whole fuel units a jump from planet index `fromPlanet` to `toPlanet` of one system burns. */
export function jumpFuelUnitsOf(fromPlanet: number, toPlanet: number): BigStat {
  return wholeUnitsOf(lawUnitsOf(fromPlanet, toPlanet))
}

/** The whole fuel units a jump between systems burns: the same distance's units times J. */
export function systemJumpFuelUnitsOf(fromPlanet: number, toPlanet: number): BigStat {
  return wholeUnitsOf(mul(lawUnitsOf(fromPlanet, toPlanet), systemJump.fuelMultiplier))
}

/** Fee(a -> b): the jump's fuel at the destination's unit price, the cost the star map shows. */
export function jumpFeeOf(fromPlanet: number, toPlanet: number): Money {
  return feeOfUnits(jumpFuelUnitsOf(fromPlanet, toPlanet), toPlanet)
}

/** The fee of a jump between systems, J times the units, at the destination's unit price. */
export function systemJumpFeeOf(fromPlanet: number, toPlanet: number): Money {
  return feeOfUnits(systemJumpFuelUnitsOf(fromPlanet, toPlanet), toPlanet)
}

/** U0 * (1 + 0.25 * |g_b - g_a|), before it is rounded up to whole units. */
function lawUnitsOf(fromPlanet: number, toPlanet: number): BigStat {
  const distance = fromSafeInteger(Math.abs(toPlanet - fromPlanet))
  return mul(fuel.baseUnits, add(ONE_UNIT, mul(fuel.distanceStep, distance)))
}

/** Rounded up to whole units, and never under one. */
function wholeUnitsOf(units: BigStat): BigStat {
  const whole = ceil(units)
  return cmp(whole, ONE_UNIT) >= 0 ? whole : ONE_UNIT
}

function feeOfUnits(units: BigStat, toPlanet: number): Money {
  return ceilMilli(mul(units, destinationUnitPriceOf(toPlanet)))
}

/** unitPrice(g) = kappa * R(g - 1): one unit's price for a jump that lands on `planetIndex`. */
export function destinationUnitPriceOf(planetIndex: number): Money {
  return mul(fuel.unitPriceShare, runValueBefore(planetIndex))
}

/** One fuel unit at the shop of planet `planetIndex`: the next planet's unit price (50.625 on P1). */
export function fuelUnitPriceOf(planetIndex: number): Money {
  return destinationUnitPriceOf(planetIndex + 1)
}

/** `units` whole fuel units at the shop of planet `planetIndex`. */
export function fuelPriceOf(planetIndex: number, units: number): Money {
  return ceilMilli(mul(fuelUnitPriceOf(planetIndex), fromSafeInteger(units)))
}

/** R(p): the median run sell value the curve stands in for planet `planetIndex` (506.25 on P1). */
export function runValueOf(planetIndex: number): Money {
  return runValueBefore(planetIndex + 1)
}

/**
 * R(g - 1), the run value of the planet before `planetIndex`: its top band is three tiers under
 * this planet's (#6 section 1), so planet 1's is tier 2 and the first hop's price stays defined.
 */
function runValueBefore(planetIndex: number): Money {
  const { oreUnits, band } = fuel.runValue
  return mul(oreUnits, oreValue(oreTier(planetIndex, band) - ECONOMY.ore.tiersPerPlanet))
}
