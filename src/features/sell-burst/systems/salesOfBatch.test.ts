import { describe, expect, it } from 'vitest'
import type { DomainEvent } from '../../../systems/authority/domainEvent'
import {
  createScriptedSession,
  dockInBay,
  mineTile,
  surfaceOreTiles,
  type ScriptedSession,
} from '../../../systems/authority/scriptedSession'
import { nextStepPriceOf } from '../../../systems/authority/sellCoins'
import { fromCanonical, sub, ZERO_MONEY } from '../../../systems/money'
import { salesOfBatch } from './salesOfBatch'

const SELL_ALL = { type: 'sellCargo', payload: { resourceTier: 'all' } } as const
const STEP = fromCanonical('100')

/** Four surface ore tiles mined (scripted mining lines its tiles, so a bill builds), then docked. */
function dockedWithOre(): { session: ScriptedSession; tick: number } {
  const session = createScriptedSession()
  surfaceOreTiles(4).forEach((tile, index) => mineTile(session, 10 + 50 * index, tile))
  const tick = 300
  dockInBay(session, tick, 'sell')
  return { session, tick }
}

const settled = (paid: string): DomainEvent => ({
  type: 'LiningSettled',
  billed: paid,
  paid,
  forgiven: '0e+0',
  tick: 5,
  playerId: 'p1',
  seq: 2,
})

const sold = (playerId: string): DomainEvent => ({
  type: 'ResourceSold',
  items: [{ tier: 1, amount: 2 }],
  value: '2e+1',
  mode: 'all',
  coinsShown: 4,
  tick: 5,
  playerId,
  seq: 1,
})

describe('sell burst hears sales', () => {
  it("pairs a real sale with the bill it paid, and the credits less the bill are the wallet's change", () => {
    const { session, tick } = dockedWithOre()
    const before = session.state().players.p1.wallet
    const events = session.submit(tick + 1, SELL_ALL)
    const [heard] = salesOfBatch(events, 'p1', nextStepPriceOf(session.state(), 'p1'))
    expect(heard.tick).toBe(tick + 1)
    expect(heard.sale.liningPaid).not.toEqual(ZERO_MONEY)
    const after = session.state().players.p1.wallet
    expect(sub(heard.sale.credits, heard.sale.liningPaid)).toEqual(sub(after, before))
  })

  it('hears no bill on a sale no settlement follows', () => {
    const [heard] = salesOfBatch([sold('p1')], 'p1', STEP)
    expect(heard.sale.liningPaid).toEqual(ZERO_MONEY)
    expect(heard.sale.coinsShown).toBe(4)
  })

  it("ignores another player's sale and a settlement with no sale before it", () => {
    expect(salesOfBatch([sold('p2'), settled('3')], 'p1', STEP)).toEqual([])
    expect(salesOfBatch([settled('3')], 'p1', STEP)).toEqual([])
  })
})
