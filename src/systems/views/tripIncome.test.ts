import { describe, expect, it } from 'vitest'
import type { DomainEvent } from '../authority/domainEvent'
import {
  createScriptedSession,
  dockInBay,
  mineTile,
  surfaceOreTiles,
} from '../authority/scriptedSession'
import { fromSafeInteger, sub, toCanonical, toSafeInteger, type Money } from '../money'
import {
  EMPTY_TRIP_LEDGER,
  lastTripIncomesOf,
  medianTripIncomeOf,
  tripLedgerAfterBatch,
  tripsToCover,
  type TripLedger,
} from './tripIncome'

// The trips the shop's "{N} trips away" reads (spec #678, ticket 719): each trip's wallet gain
// at the Sell bay, cut where the next unit reaches the hold, the last 3 kept.

const PLAYER = 'p1'
const sellAll = { type: 'sellCargo', payload: { resourceTier: 'all' } } as const

function soldEvent(value: number, playerId = PLAYER): DomainEvent {
  return {
    type: 'ResourceSold',
    playerId,
    tick: 1,
    seq: 1,
    items: [],
    value: String(value),
    mode: 'all',
    coinsShown: 0,
  }
}

function liningSettled(paid: number): DomainEvent {
  return {
    type: 'LiningSettled',
    playerId: PLAYER,
    tick: 1,
    seq: 1,
    billed: '0',
    paid: String(paid),
    forgiven: '0',
  }
}

function unitIn(): DomainEvent {
  return {
    type: 'CargoAdded',
    playerId: PLAYER,
    tick: 1,
    seq: 1,
    resourceTier: 1,
    amount: 1,
    value: '1',
    oreId: 'ore',
    depthTiles: 1,
    chunk: '0,0',
  }
}

function ledgerOfTrips(...incomes: number[]): TripLedger {
  return incomes.reduce(
    (ledger, income) => tripLedgerAfterBatch(ledger, [unitIn(), soldEvent(income)], PLAYER),
    EMPTY_TRIP_LEDGER,
  )
}

const amountsOf = (incomes: readonly Money[]) => incomes.map(toSafeInteger)

describe('trip income', () => {
  it("keeps exactly the money a real trip's sale put in the wallet", () => {
    const session = createScriptedSession()
    let ledger = EMPTY_TRIP_LEDGER
    const hear = (events: readonly DomainEvent[]) => {
      ledger = tripLedgerAfterBatch(ledger, events, PLAYER)
    }
    surfaceOreTiles(4).forEach((tile, index) => hear(mineTile(session, 50 * index, tile)))
    hear(dockInBay(session, 300, 'sell'))
    const before = session.state().players[PLAYER].wallet
    hear(session.submit(301, sellAll))
    const gain = sub(session.state().players[PLAYER].wallet, before)
    expect(lastTripIncomesOf(ledger).map(toCanonical)).toEqual([toCanonical(gain)])
  })

  it('takes the lining bill the sale paid off its income', () => {
    const ledger = tripLedgerAfterBatch(
      EMPTY_TRIP_LEDGER,
      [soldEvent(100), liningSettled(30)],
      PLAYER,
    )
    expect(amountsOf(lastTripIncomesOf(ledger))).toEqual([70])
  })

  it('counts two sales before the next unit as one trip', () => {
    const ledger = tripLedgerAfterBatch(ledger1(), [soldEvent(50)], PLAYER)
    expect(amountsOf(lastTripIncomesOf(ledger))).toEqual([150])
  })

  it('starts the next trip when the next unit reaches the hold', () => {
    const ledger = tripLedgerAfterBatch(ledger1(), [unitIn(), soldEvent(40)], PLAYER)
    expect(amountsOf(lastTripIncomesOf(ledger))).toEqual([100, 40])
  })

  it('keeps only the last 3 trips', () => {
    expect(amountsOf(lastTripIncomesOf(ledgerOfTrips(1, 2, 3, 4, 5)))).toEqual([3, 4, 5])
  })

  it('counts no trip before anything sold, and ignores another player’s sales', () => {
    const ledger = tripLedgerAfterBatch(
      EMPTY_TRIP_LEDGER,
      [unitIn(), soldEvent(100, 'p2'), unitIn()],
      PLAYER,
    )
    expect(lastTripIncomesOf(ledger)).toEqual([])
  })

  it('reads the median of 1, 2 and 3 trips, and none of no trip', () => {
    const median = (...incomes: number[]) => {
      const found = medianTripIncomeOf(incomes.map(fromSafeInteger))
      return found === null ? null : toSafeInteger(found)
    }
    expect(median()).toBeNull()
    expect(median(90)).toBe(90)
    expect(median(90, 30)).toBe(60)
    expect(median(500, 10, 90)).toBe(90)
  })

  it('rounds the trips a price takes up, never down', () => {
    expect(toSafeInteger(tripsToCover(fromSafeInteger(101), fromSafeInteger(50)))).toBe(3)
    expect(toSafeInteger(tripsToCover(fromSafeInteger(100), fromSafeInteger(50)))).toBe(2)
  })
})

function ledger1(): TripLedger {
  return tripLedgerAfterBatch(EMPTY_TRIP_LEDGER, [soldEvent(100)], PLAYER)
}
