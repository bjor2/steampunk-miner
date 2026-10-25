import { describe, expect, it } from 'vitest'
import type { CommandIntent } from '../../../systems/authority/authorityCommand'
import type { DomainEvent } from '../../../systems/authority/domainEvent'
import {
  continueScriptedSession,
  createScriptedSession,
  type ScriptedSession,
} from '../../../systems/authority/scriptedSession'
import {
  readSnapshot,
  takeSnapshot,
  type SessionSnapshot,
} from '../../../systems/authority/sessionSnapshot'
import { stateDigest } from '../../../systems/authority/stateDigest'
import { sub, toCanonical } from '../../../systems/money'
import { buyKitItemIntent } from './kitBuyRules'
import { kitHoldingsOf } from './kitHoldingsSection'
import { kitItemPriceAt } from './planetKitPrices'
import { PLANET_KITS } from './planetKitRows'
import { kitItemOf } from './planetKitSales'

// Buying a kit item at the merchant (ticket 850, PK4b): at the Sell bay, for money alone, a tool
// owned for good and a consumable stacked at the g it was bought at, up to its carry limit.

const grantMoney: CommandIntent = { type: 'debug.grantMoney', payload: { amount: '1e12' } }
const setPlanet = (planetIndex: number): CommandIntent => ({
  type: 'debug.setPlanet',
  payload: { planetIndex },
})
const teleportToDock = (bay: 'sell' | 'upgrade'): CommandIntent => ({
  type: 'debug.teleportToDock',
  payload: { bay },
})

/** Docked at `bay` on planet `planetIndex` of the first system, with plenty of money. */
function dockedOn(planetIndex: number, bay: 'sell' | 'upgrade' = 'sell'): ScriptedSession {
  const session = createScriptedSession()
  if (planetIndex !== 1) session.submit(0, setPlanet(planetIndex))
  session.submit(0, grantMoney)
  session.submit(0, teleportToDock(bay))
  return session
}

function rejectionOf(events: readonly DomainEvent[]): string | null {
  const rejected = events.find((event) => event.type === 'CommandRejected')
  return rejected?.type === 'CommandRejected' ? rejected.reason : null
}

function savedAndLoaded(session: ScriptedSession): ScriptedSession {
  const text = JSON.stringify(takeSnapshot(session.state()))
  const restored = readSnapshot(JSON.parse(text) as SessionSnapshot)
  if (!('state' in restored)) throw new Error(restored.problems.join('\n'))
  return continueScriptedSession(restored.state)
}

const itemOf = (id: string) => kitItemOf(PLANET_KITS, id)!
const planetOf = (planet: number) => ({ system: '1', planet: String(planet) })

describe('buying kit items (ticket 850)', () => {
  it('buys a Cache Crate at the planet 1 Sell bay for the merchant’s price, pinned to g = 1', () => {
    const session = dockedOn(1)
    const wallet = session.state().players.p1.wallet
    const price = kitItemPriceAt(itemOf('cache_crate'), planetOf(1))
    const events = session.submit(1, buyKitItemIntent('cache_crate'))
    expect(rejectionOf(events)).toBeNull()
    expect(events).toContainEqual(
      expect.objectContaining({
        type: 'planet-kit.KitItemBought',
        itemId: 'cache_crate',
        kind: 'consumable',
        system: '1',
        place: '1',
        g: '1',
        price: toCanonical(price),
        held: '1',
      }),
    )
    expect(session.state().players.p1.wallet).toEqual(sub(wallet, price))
    expect(kitHoldingsOf(session.state(), 'p1')).toEqual({
      tools: [],
      stacks: [{ itemId: 'cache_crate', g: '1', count: '1' }],
    })
  })

  it('stacks a consumable up to its carry limit and refuses one more, changing nothing', () => {
    const session = dockedOn(1)
    for (let crate = 0; crate < 3; crate += 1) session.submit(1, buyKitItemIntent('cache_crate'))
    expect(kitHoldingsOf(session.state(), 'p1').stacks).toEqual([
      { itemId: 'cache_crate', g: '1', count: '3' },
    ])
    const before = stateDigest(session.state())
    expect(rejectionOf(session.submit(2, buyKitItemIntent('cache_crate')))).toBe(
      'planet-kit.stack_full',
    )
    expect(stateDigest(session.state())).toBe(before)
  })

  it('pins a Damp Flask to the g of planet 3, where it is sold', () => {
    const session = dockedOn(3)
    session.submit(1, buyKitItemIntent('damp_flask'))
    expect(kitHoldingsOf(session.state(), 'p1').stacks).toEqual([
      { itemId: 'damp_flask', g: '3', count: '1' },
    ])
  })

  it('owns a tool for good: a second buy is refused and it stays through a jump, save and load', () => {
    let session = dockedOn(2)
    const price = kitItemPriceAt(itemOf('scree_plough'), planetOf(2))
    const events = session.submit(1, buyKitItemIntent('scree_plough'))
    expect(events).toContainEqual(
      expect.objectContaining({ itemId: 'scree_plough', kind: 'tool', price: toCanonical(price) }),
    )
    expect(rejectionOf(session.submit(2, buyKitItemIntent('scree_plough')))).toBe(
      'planet-kit.kit_tool_owned',
    )
    session = savedAndLoaded(session)
    session.submit(3, setPlanet(5))
    expect(kitHoldingsOf(session.state(), 'p1').tools).toEqual(['scree_plough'])
  })

  it('sells a tool at its home g at a later merchant, no markup', () => {
    const session = dockedOn(4)
    const events = session.submit(1, buyKitItemIntent('scree_plough'))
    const homePrice = kitItemPriceAt(itemOf('scree_plough'), planetOf(2))
    expect(events).toContainEqual(
      expect.objectContaining({ itemId: 'scree_plough', g: '4', price: toCanonical(homePrice) }),
    )
  })

  it('refuses what this merchant does not stock: a later tool, or a consumable away from home', () => {
    expect(rejectionOf(dockedOn(1).submit(1, buyKitItemIntent('scree_plough')))).toBe(
      'planet-kit.not_sold_here',
    )
    expect(rejectionOf(dockedOn(2).submit(1, buyKitItemIntent('cache_crate')))).toBe(
      'planet-kit.not_sold_here',
    )
  })

  it('refuses a buy off the Sell bay, where no merchant trades, or of no kit item', () => {
    expect(rejectionOf(dockedOn(1, 'upgrade').submit(1, buyKitItemIntent('cache_crate')))).toBe(
      'wrong_bay',
    )
    expect(rejectionOf(dockedOn(6).submit(1, buyKitItemIntent('scree_plough')))).toBe(
      'planet-kit.no_merchant',
    )
    expect(rejectionOf(dockedOn(1).submit(1, buyKitItemIntent('scree_hood')))).toBe(
      'planet-kit.unknown_kit_item',
    )
  })

  it('refuses a buy the wallet cannot pay, spending nothing', () => {
    const session = createScriptedSession()
    session.submit(0, setPlanet(5))
    session.submit(0, teleportToDock('sell'))
    const before = stateDigest(session.state())
    expect(rejectionOf(session.submit(1, buyKitItemIntent('vent_vane')))).toBe('money_short')
    expect(stateDigest(session.state())).toBe(before)
  })

  it('leaves a run that buys nothing out of the state, so its digest is unchanged', () => {
    const session = dockedOn(1)
    expect(session.state().players.p1.slices?.['planet-kit.holdings']).toBeUndefined()
  })
})
