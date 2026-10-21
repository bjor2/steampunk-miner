/**
 * Gain text (spec #678, ticket 687; design-system.md section 11): what one buy changes, said as the
 * stat and its change, "+24% drill speed", never a before and after table. The share is read in
 * decimal from the two amounts and printed by the shared percent formatter, which rounds toward
 * zero, so a gain never reads larger than it is. A stat that starts from nothing has no share, so
 * it says the amount it gains instead.
 */
import { formatAmount, formatPercent } from '../displayAmount'
import { cmp, div, sub, ZERO_MONEY, type Money } from '../money'

/** "+24% drill speed", "-12% cooldown", "+3 charges" from nothing, "+0% hull" for no change. */
export function gainTextOf(before: Money, after: Money, statWord: string): string {
  return `${changeTextOf(before, after)} ${statWord}`
}

function changeTextOf(before: Money, after: Money): string {
  const change = sub(after, before)
  if (cmp(before, ZERO_MONEY) === 0) return signed(change, formatAmount(change))
  return signed(change, formatPercent(div(change, before)))
}

/** The formatters print a minus already; a rise or no change reads with a plus. */
function signed(change: Money, text: string): string {
  return cmp(change, ZERO_MONEY) < 0 ? text : `+${text}`
}
