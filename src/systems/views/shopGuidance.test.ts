import { describe, expect, it } from 'vitest'
import type { DomainEvent } from '../authority/domainEvent'
import { fromCanonical, fromSafeInteger } from '../money'
import { guidanceTextOf, shopGuidanceOf } from './shopGuidance'
import { EMPTY_TRIP_LEDGER, tripLedgerAfterBatch, type TripLedger } from './tripIncome'

// The shop cards' "Affordable" or "{N} trips away" (spec #678, ticket 719): N is the rest of the
// price over the median of the last 3 trips' income, rounded up, hidden until a trip is done.

const PLAYER = 'p1'

function tripEvents(income: number): DomainEvent[] {
  const stamp = { playerId: PLAYER, tick: 1, seq: 1 }
  return [
    {
      ...stamp,
      type: 'CargoAdded',
      resourceTier: 1,
      amount: 1,
      value: '1',
      oreId: 'ore',
      depthTiles: 1,
      chunk: '0,0',
    },
    {
      ...stamp,
      type: 'ResourceSold',
      items: [],
      value: String(income),
      mode: 'all',
      coinsShown: 0,
    },
  ]
}

function ledgerOfTrips(...incomes: number[]): TripLedger {
  return incomes.reduce(
    (ledger, income) => tripLedgerAfterBatch(ledger, tripEvents(income), PLAYER),
    EMPTY_TRIP_LEDGER,
  )
}

function textOf(price: number, balance: number, ledger: TripLedger): string | null {
  return guidanceTextOf(fromSafeInteger(price), shopGuidanceOf(fromSafeInteger(balance), ledger))
}

describe('shop guidance', () => {
  it('stays hidden with no trip of history, affordable or not', () => {
    expect(textOf(500, 0, EMPTY_TRIP_LEDGER)).toBeNull()
    expect(textOf(500, 900, EMPTY_TRIP_LEDGER)).toBeNull()
  })

  it('reads one trip of history as the median, the rest rounded up', () => {
    expect(textOf(500, 100, ledgerOfTrips(100))).toBe('4 trips away')
    expect(textOf(500, 99, ledgerOfTrips(100))).toBe('5 trips away')
    expect(textOf(150, 100, ledgerOfTrips(100))).toBe('1 trip away')
  })

  it('reads the median of 3 trips, so one lucky haul does not shorten the way', () => {
    expect(textOf(1000, 0, ledgerOfTrips(50, 5000, 200))).toBe('5 trips away')
  })

  it('reads only the last 3 trips', () => {
    expect(textOf(1000, 0, ledgerOfTrips(1, 1, 1, 100, 100, 100))).toBe('10 trips away')
  })

  it('says Affordable once the wallet covers the price, to the coin', () => {
    expect(textOf(500, 500, ledgerOfTrips(100))).toBe('Affordable')
    expect(textOf(500, 499, ledgerOfTrips(100))).toBe('1 trip away')
  })

  it('stays hidden after trips that brought nothing in', () => {
    expect(textOf(500, 0, ledgerOfTrips(0))).toBeNull()
  })

  it('decides Affordable on the exact amounts, not the rounded figures', () => {
    const price = fromCanonical('1.2345e20')
    const guidance = shopGuidanceOf(fromCanonical('1.2344999e20'), ledgerOfTrips(100))
    expect(guidanceTextOf(price, guidance)).not.toBe('Affordable')
  })

  it('counts a huge way in the compact format, within 6 characters', () => {
    const text = guidanceTextOf(
      fromCanonical('1e300'),
      shopGuidanceOf(fromSafeInteger(0), ledgerOfTrips(3)),
    )
    expect(text).toMatch(/^\S{1,6} trips away$/)
  })
})
