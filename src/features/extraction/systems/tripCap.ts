/**
 * The hard 15% clamp on income items (#162 4.5, Systems): per trip the drain, the siphon and the
 * drain combos together move at most
 *
 *   tripCap = floorMilli(0.15 × cargoCapacity × V(t(p, b)))
 *
 * where `b` is the band at the activation, so their value per trip never passes 15% of a full
 * hold of that band's ore (#162 acceptance 4). The share is data (`items.income.tripCapShare`).
 */
import { oreTier, oreValue } from '../../../systems/economy/oreEconomy'
import {
  cmp,
  div,
  floor,
  floorMilli,
  fromSafeInteger,
  mul,
  sub,
  toSafeInteger,
  ZERO_MONEY,
  type Money,
} from '../../../systems/money'
import { EXTRACTION_ECONOMY } from './extractionEconomy'
import { amountsOfTrip, type IncomeTrip } from './incomeTrip'

const PERCENT = fromSafeInteger(100)

export function tripCapAt(planetIndex: number, band: number, cargoCapacity: number): Money {
  const fullHold = mul(fromSafeInteger(cargoCapacity), oreValue(oreTier(planetIndex, band)))
  return floorMilli(mul(EXTRACTION_ECONOMY.income.tripCapShare, fullHold))
}

/** What the trip may still move under `cap`; none once it is at or past it. */
export function roomUnderCapOf(incomeItemValue: Money, cap: Money): Money {
  const room = sub(cap, incomeItemValue)
  return cmp(room, ZERO_MONEY) > 0 ? room : ZERO_MONEY
}

/**
 * `drain_yield.tripCapFraction`: the share of `cap` the trip has used, cut to the money quantum,
 * so the #164 card's whole percent is this fraction floored.
 */
export function tripCapFractionOf(incomeItemValue: Money, cap: Money): Money {
  if (cmp(cap, ZERO_MONEY) === 0) return ZERO_MONEY
  return floorMilli(div(incomeItemValue, cap))
}

/**
 * The #164 card's `N` in "Trip cap N% used": `floor(100 × incomeItemValue / tripCap)`, so it never
 * reads 100 before a use is refused `drain_capped`. 0 before the trip's first activation.
 */
export function tripCapUsedPercentOf(trip: IncomeTrip): number {
  const { incomeItemValue, tripCap } = amountsOfTrip(trip)
  if (cmp(tripCap, ZERO_MONEY) === 0) return 0
  return toSafeInteger(floor(mul(PERCENT, div(incomeItemValue, tripCap))))
}
