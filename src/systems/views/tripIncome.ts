/**
 * What the local player's last trips brought in (spec #678, Systems 2; ticket 719): the shop's
 * "{N} trips away" reads the median of the last 3. A trip's income is the wallet's gain at the Sell
 * bay, each `ResourceSold` less the lining bill its `LiningSettled` paid out of it, the same net the
 * sale receipt totals (ticket 717). A trip gathers every sale until the next unit reaches the hold,
 * the receipt's boundary, so selling a hold in two goes is one trip. Pure: a ledger and one batch
 * of authority events in, the next ledger out; presentation only, nothing is saved.
 */
import type { DomainEvent } from '../authority/domainEvent'
import { add, ceil, cmp, div, fromCanonical, fromSafeInteger, sub, type Money } from '../money'

export interface TripLedger {
  /** The ended trips' incomes, oldest first, at most `TRIPS_KEPT`. */
  ended: readonly Money[]
  /** The trip under way once it sold something; null before its first sale. */
  current: Money | null
}

/** Spec #678: the median of the last 3 trips. */
export const TRIPS_KEPT = 3

export const EMPTY_TRIP_LEDGER: TripLedger = { ended: [], current: null }

type ResourceSold = Extract<DomainEvent, { type: 'ResourceSold' }>

const HALVES = fromSafeInteger(2)

export function tripLedgerAfterBatch(
  ledger: TripLedger,
  events: readonly DomainEvent[],
  playerId: string,
): TripLedger {
  return events.reduce(
    (running, event, index) => ledgerAfterEvent(running, events, index, playerId),
    ledger,
  )
}

/** The last 3 trips with a sale, the one under way included, oldest first. */
export function lastTripIncomesOf(ledger: TripLedger): Money[] {
  const trips = ledger.current === null ? ledger.ended : [...ledger.ended, ledger.current]
  return trips.slice(-TRIPS_KEPT)
}

/** The median of the trips' incomes (the mean of the middle two for two); null with none. */
export function medianTripIncomeOf(incomes: readonly Money[]): Money | null {
  if (incomes.length === 0) return null
  const sorted = [...incomes].sort(cmp)
  const middle = Math.floor(sorted.length / 2)
  if (sorted.length % 2 === 1) return sorted[middle]
  return div(add(sorted[middle - 1], sorted[middle]), HALVES)
}

/**
 * How many trips at that income the rest of the price takes, rounded up so the shop never
 * promises one trip too few.
 */
export function tripsToCover(remaining: Money, tripIncome: Money): Money {
  return ceil(div(remaining, tripIncome))
}

function ledgerAfterEvent(
  ledger: TripLedger,
  events: readonly DomainEvent[],
  index: number,
  playerId: string,
): TripLedger {
  const event = events[index]
  if (event.playerId !== playerId) return ledger
  if (event.type === 'CargoAdded') return ledgerOnNextTrip(ledger)
  if (event.type === 'ResourceSold') return ledgerWithSale(ledger, saleNetOf(event, events, index))
  return ledger
}

/** The trip under way ends; a trip that sold nothing leaves the ledger as it was. */
function ledgerOnNextTrip(ledger: TripLedger): TripLedger {
  if (ledger.current === null) return ledger
  return { ended: [...ledger.ended, ledger.current].slice(-TRIPS_KEPT), current: null }
}

function ledgerWithSale(ledger: TripLedger, net: Money): TripLedger {
  return { ...ledger, current: ledger.current === null ? net : add(ledger.current, net) }
}

/** The authority pays the lining bill out of the sale in the same answer, right after it. */
function saleNetOf(sold: ResourceSold, events: readonly DomainEvent[], index: number): Money {
  const next = events[index + 1]
  const credits = fromCanonical(sold.value)
  return next?.type === 'LiningSettled' ? sub(credits, fromCanonical(next.paid)) : credits
}
