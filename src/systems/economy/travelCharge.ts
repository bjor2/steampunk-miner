/**
 * What one hop costs the paying player (ticket 648, clamp locked by the GD on 21 Oct): travel is
 * never a hard gate, so the fee is
 *   max(0, min(row fee, money - next on-curve price))
 * where the row fee is the travel fee on the planet's price row and the next on-curve price is the
 * cheaper of that row's next drill and next tip, both read at the moment of travel as Money. A player
 * who sold everything still travels, at a reduced fee or free, and keeps the next on-curve purchase.
 * In co-op `money` is the paying player's wallet.
 */
import { cmp, sub, ZERO_MONEY, type Money } from '../money'
import type { PlanetPriceRow } from './economyTables'

export type TravelPriceRow = Pick<PlanetPriceRow, 'travelFee' | 'drillPowerNext' | 'drillTipNext'>

/** The row's next on-curve purchases, all the clamp reads besides the fee. */
export type OnCurvePriceRow = Pick<PlanetPriceRow, 'drillPowerNext' | 'drillTipNext'>

export function travelChargeOf(row: TravelPriceRow, money: Money): Money {
  return hopChargeOf(row.travelFee, row, money)
}

/**
 * The clamp on any hop's `fee`: since the star map (ticket 756) also the fuel a player buys for
 * the hop to the next planet, which is what a jump there costs.
 */
export function hopChargeOf(fee: Money, row: OnCurvePriceRow, money: Money): Money {
  const spare = sub(money, nextOnCurvePriceOf(row))
  return higherOf(ZERO_MONEY, lowerOf(fee, spare))
}

/** True when the clamp lowers the hop below the row fee (the #644 report counts these). */
export function isTravelFeeClamped(row: TravelPriceRow, money: Money): boolean {
  return cmp(travelChargeOf(row, money), row.travelFee) < 0
}

export function nextOnCurvePriceOf(row: OnCurvePriceRow): Money {
  return lowerOf(row.drillPowerNext, row.drillTipNext)
}

function lowerOf(a: Money, b: Money): Money {
  return cmp(a, b) <= 0 ? a : b
}

function higherOf(a: Money, b: Money): Money {
  return cmp(a, b) >= 0 ? a : b
}
