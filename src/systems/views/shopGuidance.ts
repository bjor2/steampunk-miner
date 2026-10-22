/**
 * The shop's guidance under a price (spec #678, Progression 2 and Systems 2; ticket 719):
 * "Affordable" once the wallet covers it, else "{N} trips away", N the rest of the price over the
 * median of the last 3 trips' income (`tripIncome.ts`), rounded up. Hidden until a trip has sold
 * something, and where the trips brought nothing in. The exact amounts decide; the shown price
 * rounds up and the shown balance down (ticket 681), so a card never reads affordable when the
 * wallet is short. Pure.
 */
import { formatPrice } from '../displayAmount'
import { cmp, sub, ZERO_MONEY, type Money } from '../money'
import { lastTripIncomesOf, medianTripIncomeOf, tripsToCover, type TripLedger } from './tripIncome'

/** What a card's guidance is read against: the wallet and the trips' median income. */
export interface ShopGuidance {
  balance: Money
  /** The median of the last 3 trips' income; null before the first trip sold anything. */
  tripIncome: Money | null
}

export type PriceGuidance = { kind: 'affordable' } | { kind: 'tripsAway'; trips: Money }

const AFFORDABLE_TEXT = 'Affordable'

const ONE_TRIP = '1'

export function shopGuidanceOf(balance: Money, ledger: TripLedger): ShopGuidance {
  return { balance, tripIncome: medianTripIncomeOf(lastTripIncomesOf(ledger)) }
}

/** Null while hidden: no trip done yet, or trips that brought nothing in. */
export function priceGuidanceOf(price: Money, guidance: ShopGuidance): PriceGuidance | null {
  const { balance, tripIncome } = guidance
  if (tripIncome === null || cmp(tripIncome, ZERO_MONEY) <= 0) return null
  if (cmp(balance, price) >= 0) return { kind: 'affordable' }
  return { kind: 'tripsAway', trips: tripsToCover(sub(price, balance), tripIncome) }
}

export function priceGuidanceTextOf(guidance: PriceGuidance): string {
  if (guidance.kind === 'affordable') return AFFORDABLE_TEXT
  const trips = formatPrice(guidance.trips)
  return trips === ONE_TRIP ? '1 trip away' : `${trips} trips away`
}

/** The card's guidance text, or null while hidden. */
export function guidanceTextOf(price: Money, guidance: ShopGuidance): string | null {
  const reading = priceGuidanceOf(price, guidance)
  return reading === null ? null : priceGuidanceTextOf(reading)
}
