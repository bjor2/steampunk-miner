import { describe, expect, it } from 'vitest'
import { add, div, fromCanonical, fromSafeInteger, sub, toCanonical, ZERO_MONEY } from '../money'
import { digTenMetresUntil } from './casingDigFixtures'
import type { DomainEvent } from './domainEvent'
import { settleLiningBill } from './liningBill'
import { serviceQuote } from './platformServices'
import { readSnapshot, takeSnapshot } from './sessionSnapshot'
import {
  dockInBay,
  mineTile,
  surfaceOreTiles,
  typesOf,
  type ScriptedSession,
} from './scriptedSession'

const SELL_ALL = { type: 'sellCargo', payload: { resourceTier: 'all' } } as const

const settledOf = (events: readonly DomainEvent[]) =>
  events.filter((event) => event.type === 'LiningSettled')

/** A 10 m dig with `money` in the wallet, then three surface ore tiles mined for something to sell. */
function digAndMine(money: string): { session: ScriptedSession; tick: number } {
  const { session, end } = digTenMetresUntil(1, money)
  surfaceOreTiles(3).forEach((tile, index) => mineTile(session, end + 100 * (index + 1), tile))
  return { session, tick: end + 500 }
}

function sellAllAtTheSellBay(session: ScriptedSession, tick: number): DomainEvent[] {
  dockInBay(session, tick, 'sell')
  return session.submit(tick, SELL_ALL)
}

/** Undocks when docked (after a tow) and mines one surface ore tile. */
function mineOneOreTile(session: ScriptedSession, tick: number, index: number): void {
  if (session.vehicle().mode === 'docked') session.submit(tick, { type: 'undock', payload: {} })
  mineTile(session, tick, surfaceOreTiles(index + 1)[index])
}

function walletOf(session: ScriptedSession) {
  return session.state().players.p1.wallet
}

describe('lining bill (#76 amendment, #115)', () => {
  it('settles the whole bill out of the next sale, before the payout reaches the wallet', () => {
    const { session, tick } = digAndMine('1000')
    // Driving onto the pad lays the dig's last rings, so the bill is read once docked.
    dockInBay(session, tick, 'sell')
    const billed = session.vehicle().liningBill
    const wallet = walletOf(session)
    const value = serviceQuote(session.state(), 'p1').saleValue
    const sale = session.submit(tick, SELL_ALL)
    expect(typesOf(sale)).toEqual(['ResourceSold', 'LiningSettled'])
    expect(sale[1]).toMatchObject({
      billed: toCanonical(billed),
      paid: toCanonical(billed),
      forgiven: toCanonical(ZERO_MONEY),
    })
    expect(toCanonical(walletOf(session))).toBe(toCanonical(sub(add(wallet, value), billed)))
    expect(toCanonical(session.vehicle().liningBill)).toBe(toCanonical(ZERO_MONEY))
  })

  it('charges a vehicle that dives with an empty wallet the same lining as one with savings', () => {
    const broke = digAndMine('0')
    const saving = digAndMine('1000')
    const brokeSale = settledOf(sellAllAtTheSellBay(broke.session, broke.tick))
    const savingSale = settledOf(sellAllAtTheSellBay(saving.session, saving.tick))
    expect(brokeSale).toHaveLength(1)
    expect(fromCanonical(brokeSale[0].paid)).not.toEqual(ZERO_MONEY)
    expect(brokeSale).toEqual(savingSale)
  })

  it('caps the payment at the sale value and forgives the rest, so there is never debt', () => {
    const { session } = digAndMine('1000')
    const billed = session.vehicle().liningBill
    const smallSale = div(billed, fromSafeInteger(4))
    // A sale worth a quarter of the bill, already paid into the wallet.
    const settled = settleLiningBill(session.state(), 'p1', smallSale)
    expect(settled.events).toEqual([
      {
        type: 'LiningSettled',
        billed: toCanonical(billed),
        paid: toCanonical(smallSale),
        forgiven: toCanonical(sub(billed, smallSale)),
      },
    ])
    expect(toCanonical(settled.state.players.p1.wallet)).toBe(
      toCanonical(sub(walletOf(session), smallSale)),
    )
    expect(toCanonical(settled.state.players.p1.vehicle.liningBill)).toBe(toCanonical(ZERO_MONEY))
  })

  it('logs nothing for a sale with no bill', () => {
    const { session, tick } = digAndMine('0')
    sellAllAtTheSellBay(session, tick)
    const settled = settleLiningBill(session.state(), 'p1', fromCanonical('10'))
    expect(settled.events).toEqual([])
    expect(settled.state).toBe(session.state())
  })

  it('keeps the bill through a rescue tow and settles it at the next sale', () => {
    const { session, end } = digTenMetresUntil(1, '1000')
    const billed = session.vehicle().liningBill
    session.submit(end, { type: 'debug.setHull', payload: { hull: '0' } })
    const towed = session.advanceTo(end + 600)
    expect(typesOf(towed)).toContain('RescueTriggered')
    expect(settledOf(towed)).toEqual([])
    expect(toCanonical(session.vehicle().liningBill)).toBe(toCanonical(billed))
    mineOneOreTile(session, end + 700, 0)
    const sale = sellAllAtTheSellBay(session, end + 800)
    expect(fromCanonical(settledOf(sale)[0].billed)).not.toEqual(ZERO_MONEY)
  })

  it('travels in the session snapshot', () => {
    const { session } = digTenMetresUntil(1, '0')
    const restored = readSnapshot(JSON.parse(JSON.stringify(takeSnapshot(session.state()))))
    expect('state' in restored && toCanonical(restored.state.players.p1.vehicle.liningBill)).toBe(
      toCanonical(session.vehicle().liningBill),
    )
  })
})
