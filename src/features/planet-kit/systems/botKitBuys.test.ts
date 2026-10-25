import { describe, expect, it } from 'vitest'
import type { CommandIntent } from '../../../systems/authority/authorityCommand'
import type { AuthorityState } from '../../../systems/authority/authorityState'
import { createScriptedSession } from '../../../systems/authority/scriptedSession'
import type { KitPolicy } from '../../../systems/bot/botCrates'
import { buyLocalKit } from '../../../systems/bot/botKitBuys'
import { createBotSession } from '../../../systems/bot/botSession'
import { botPlanetOf } from '../../../systems/bot/botTravel'
import { newDownBoreTally } from '../../../systems/bot/downBores'
import { newSidewaysBoreTally } from '../../../systems/bot/sidewaysBores'
import { localItemsOf } from './botKitBuys'
import { heldCountOf } from './kitHoldings'
import { kitHoldingsOf } from './kitHoldingsSection'

// The pacing bot at each planet's merchant (ticket 826, PK7): off by default, so the bare bot is
// the skip-all-merchants row; under `merchant: 'buy_local_kit'` it buys the planet's own kit at
// the Sell bay, a tool once and a consumable to its carry limit, the crate left to the crate policy.

const MERCHANTS_ON: KitPolicy = { crates: 'never', merchant: 'buy_local_kit' }

/** Docked at the Sell bay of planet `planetIndex` with `amount` in the wallet. */
function dockedOn(planetIndex: number, amount = '1e12'): AuthorityState {
  const scripted = createScriptedSession()
  if (planetIndex !== 1) {
    scripted.submit(0, { type: 'debug.setPlanet', payload: { planetIndex } } as CommandIntent)
  }
  scripted.submit(0, { type: 'debug.setMoney', payload: { amount } })
  scripted.submit(0, { type: 'debug.teleportToDock', payload: { bay: 'sell' } })
  return scripted.state()
}

/** The item ids the bot bought at the merchant, after one Sell-bay visit under `kitPolicy`. */
function boughtAfterVisit(state: AuthorityState, kitPolicy?: KitPolicy): string[] {
  const session = createBotSession(state, 'p1')
  const planet = botPlanetOf(
    session,
    'blast',
    [],
    'never',
    newSidewaysBoreTally(),
    newDownBoreTally(),
    kitPolicy,
  )
  buyLocalKit(session, planet)
  return session
    .events()
    .flatMap((event) => (event.type === 'planet-kit.KitItemBought' ? [event.itemId] : []))
}

describe('planet kit: the pacing bot at each planet merchant (ticket 826)', () => {
  it('names one different local item on each of planets 2 to 5 and none but the crate on planet 1', () => {
    const local = [1, 2, 3, 4, 5].map((planet) =>
      localItemsOf(dockedOn(planet)).map(({ id }) => id),
    )
    expect(local).toEqual([[], ['scree_plough'], ['damp_flask'], ['shard_tongs'], ['vent_vane']])
  })

  it('buys nothing at any merchant with the policy at its default', () => {
    expect([1, 2, 3, 4, 5].flatMap((planet) => boughtAfterVisit(dockedOn(planet)))).toEqual([])
  })

  it('buys the planet 2 plough once, owned for good, under buy_local_kit', () => {
    expect(boughtAfterVisit(dockedOn(2), MERCHANTS_ON)).toEqual(['scree_plough'])
  })

  it('stocks the planet 3 flask to its carry limit of 3 and no further', () => {
    const session = createBotSession(dockedOn(3), 'p1')
    const planet = botPlanetOf(
      session,
      'blast',
      [],
      'never',
      newSidewaysBoreTally(),
      newDownBoreTally(),
      MERCHANTS_ON,
    )
    buyLocalKit(session, planet)
    buyLocalKit(session, planet)
    expect(heldCountOf(kitHoldingsOf(session.state(), 'p1'), 'damp_flask')).toBe(3n)
  })

  it('leaves the planet 1 Cache Crate to the crate policy', () => {
    expect(boughtAfterVisit(dockedOn(1), MERCHANTS_ON)).toEqual([])
  })

  it('buys nothing the wallet cannot pay with the next service kept back', () => {
    expect(boughtAfterVisit(dockedOn(4, '1'), MERCHANTS_ON)).toEqual([])
  })
})
