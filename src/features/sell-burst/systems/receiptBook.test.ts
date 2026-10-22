import { describe, expect, it } from 'vitest'
import type { DomainEvent } from '../../../systems/authority/domainEvent'
import {
  createScriptedSession,
  dockInBay,
  mineTile,
  surfaceOreTiles,
  type ScriptedSession,
} from '../../../systems/authority/scriptedSession'
import { add, sub, toCanonical, ZERO_MONEY } from '../../../systems/money'
import { bookAfterBatch, EMPTY_BOOK, type ReceiptBook } from './receiptBook'

const PLAYER = 'p1'
const sellAll = { type: 'sellCargo', payload: { resourceTier: 'all' } } as const

/** A session whose every answer the book hears, batch by batch, as the store's listener does. */
function heardSession() {
  const session = createScriptedSession()
  let book: ReceiptBook = EMPTY_BOOK
  const hear = (events: readonly DomainEvent[]) => {
    book = bookAfterBatch(book, { events, state: session.state(), playerId: PLAYER })
    return events
  }
  return { session, hear, book: () => book }
}

function mineSurfaceOre(
  heard: ReturnType<typeof heardSession>,
  tiles: number,
  firstTick: number,
): void {
  surfaceOreTiles(tiles + firstTick / 50)
    .slice(firstTick / 50)
    .forEach((tile, index) => heard.hear(mineTile(heard.session, firstTick + 50 * index, tile)))
}

function walletOf(session: ScriptedSession) {
  return session.state().players[PLAYER].wallet
}

function soldUnitsOf(book: ReceiptBook): number {
  return (book.receipt?.lines ?? []).reduce((total, line) => total + line.count, 0)
}

describe('sell receipt book', () => {
  it("totals exactly the money the trip's sale put in the wallet, its lining bill taken off", () => {
    const heard = heardSession()
    mineSurfaceOre(heard, 4, 0)
    heard.hear(dockInBay(heard.session, 300, 'sell'))
    const before = walletOf(heard.session)
    const events = heard.hear(heard.session.submit(301, sellAll))
    const receipt = heard.book().receipt
    expect(events.some((event) => event.type === 'LiningSettled')).toBe(true)
    expect(receipt).not.toBeNull()
    expect(toCanonical(receipt!.net)).toBe(toCanonical(sub(walletOf(heard.session), before)))
    expect(heard.book().isShown).toBe(true)
  })

  it("adds its lines' coins up to the sale's credits and its counts to the units sold", () => {
    const heard = heardSession()
    mineSurfaceOre(heard, 4, 0)
    heard.hear(dockInBay(heard.session, 300, 'sell'))
    const events = heard.hear(heard.session.submit(301, sellAll))
    const sold = events.find((event) => event.type === 'ResourceSold')
    const receipt = heard.book().receipt!
    const coins = receipt.lines.reduce((total, line) => add(total, line.coin), ZERO_MONEY)
    expect(toCanonical(coins)).toBe(sold?.type === 'ResourceSold' ? sold.value : null)
    expect(soldUnitsOf(heard.book())).toBe(4)
  })

  it('names each unit the drill brought in by its species', () => {
    const heard = heardSession()
    mineSurfaceOre(heard, 4, 0)
    heard.hear(dockInBay(heard.session, 300, 'sell'))
    heard.hear(heard.session.submit(301, sellAll))
    const lines = heard.book().receipt!.lines
    expect(lines.length).toBeGreaterThan(0)
    expect(lines.every((line) => line.key.startsWith('species:') && line.name !== null)).toBe(true)
  })

  it('keeps the trip total as the last trip once the next unit reaches the hold', () => {
    const heard = heardSession()
    mineSurfaceOre(heard, 2, 0)
    heard.hear(dockInBay(heard.session, 200, 'sell'))
    heard.hear(heard.session.submit(201, sellAll))
    const firstTrip = heard.book().receipt!.net
    heard.hear(heard.session.submit(202, { type: 'undock', payload: {} }))
    expect(heard.book().isShown).toBe(false)
    expect(heard.book().lastTripNet).toBeNull()
    mineSurfaceOre(heard, 1, 250)
    expect(heard.book().receipt).toBeNull()
    expect(heard.book().lastTripNet).toEqual(firstTrip)
  })

  it('never holds more of a tier than the hold does', () => {
    const heard = heardSession()
    mineSurfaceOre(heard, 3, 0)
    const counted = heard.book().manifest.reduce((total, kind) => total + kind.count, 0)
    const held = Object.values(heard.session.vehicle().cargo.ore).reduce((a, b) => a + b, 0)
    expect(held).toBe(3)
    expect(counted).toBe(held)
  })
})
