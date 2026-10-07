/**
 * The guard 2 share-model table `balance:charges` prints (ticket 247, Systems on K8 #218), from
 * `chargeSharePayoff.ts`'s rows: per planet, band and size, the dynamite-gated cells a charge
 * frees, their value, the charge's price and the payoff. Reported only, never gated.
 */
import type { ChargeSharePayoff } from '../systems/bot/chargeSharePayoff'
import { formatAmount } from '../systems/displayAmount'
import { mul, roundToWhole, toSafeInteger, fromSafeInteger, type Money } from '../systems/money'

/** Ticket 247 expected dynamite-gated cells only above band 3; the note names any below. */
const LAST_UNEXPECTED_BAND = 3
const HUNDREDTHS = 100
const TENTHS = 10

export function chargeSharePayoffTable(rows: readonly ChargeSharePayoff[]): string {
  if (rows.length === 0) return 'no band holds dynamite-gated lead cells'
  return [
    '| planet | band | size | gated cells freed | value freed | price | payoff | 15% cap hit |',
    '| --- | --- | --- | --- | --- | --- | --- | --- |',
    ...rows.map(chargeSharePayoffLine),
  ].join('\n')
}

/** The bands 1 to 3 the seed's gate tables put dynamite-gated cells in, or `none`. */
export function lowBandsWithDynamiteCells(rows: readonly ChargeSharePayoff[]): string {
  const where = rows
    .filter((row) => row.band <= LAST_UNEXPECTED_BAND)
    .map((row) => `planet ${row.planetIndex} band ${row.band}`)
  return where.length === 0 ? 'none' : [...new Set(where)].join(', ')
}

function chargeSharePayoffLine(row: ChargeSharePayoff): string {
  return `| ${row.planetIndex} | ${row.band} | ${row.size} | ${fixedOf(row.gatedCells, TENTHS)} | ${formatAmount(roundToWhole(row.valueFreed))} | ${formatAmount(roundToWhole(row.price))} | ${fixedOf(row.payoff, HUNDREDTHS)}x | ${row.isCapped ? 'yes' : 'no'} |`
}

/** A small non-negative amount to one or two places: `2.05`. */
function fixedOf(amount: Money, scale: number): string {
  const scaled = toSafeInteger(roundToWhole(mul(amount, fromSafeInteger(scale))))
  const places = String(scale).length - 1
  const fraction = String(scaled % scale).padStart(places, '0')
  return `${Math.floor(scaled / scale)}.${fraction}`
}
