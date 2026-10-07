/**
 * What a band's ore is worth under the mix (#141 "Value", #142's 15% guard): the expected sale
 * price per ore unit over the band's own `V(t_b)`, and the share of that value the signature holds.
 * Prices come from the kernel curve through the `ores` index; a signature sells
 * `signatureValueLead` tiers up (`oreSalePrice(t_5 + 1)`). Vertical.
 */
import {
  add,
  div,
  fromFiniteNumber,
  fromSafeInteger,
  mul,
  type Money,
} from '../../../systems/money'
import { ORE_ROWS, oreSalePrice, oreTierOf } from '../../ores'
import type { OreMixEntry } from './oreMix'

const BASIS_POINTS = fromSafeInteger(10000)

/** Expected price per ore unit of band `b` over `V(t_b)`: #140's multiplier plus the signature's. */
export function bandValueMultiplierOf(
  entries: readonly OreMixEntry[],
  planetIndex: number,
  band: number,
): Money {
  const bandPrice = oreSalePrice(oreTierOf(planetIndex, band, 0))
  return div(div(expectedValueBpOf(entries), BASIS_POINTS), bandPrice)
}

/** The share of the band's expected value that signature cells hold. */
export function signatureValueShareOf(entries: readonly OreMixEntry[]): Money {
  const signatures = entries.filter((entry) => entry.signature)
  return div(expectedValueBpOf(signatures), expectedValueBpOf(entries))
}

/** A cell's sale price: its tier's, a signature `signatureValueLead` tiers up. */
export function entrySalePriceOf(entry: OreMixEntry): Money {
  return oreSalePrice(entry.signature ? entry.tier + ORE_ROWS.signatureValueLead : entry.tier)
}

function expectedValueBpOf(entries: readonly OreMixEntry[]): Money {
  return entries
    .map((entry) => mul(fromFiniteNumber(entry.weightBp), entrySalePriceOf(entry)))
    .reduce(add, fromSafeInteger(0))
}
