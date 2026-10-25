import { describe, expect, it } from 'vitest'
import type { CommandIntent } from '../../../systems/authority/authorityCommand'
import { createAuthorityState } from '../../../systems/authority/authorityState'
import { isFeatureUnlocked } from '../../../systems/authority/featureUnlocks'
import { createScriptedSession, WORLD_SEED } from '../../../systems/authority/scriptedSession'
import { buyKitItemIntent } from './kitBuyRules'
import {
  CARRIED_FULL_LOCK_REASON,
  HELD_FROM_SALE_LOCK_REASON,
  isMerchantTradingHere,
  merchantPanelOf,
  OWNED_LOCK_REASON,
} from './merchantPanel'
import { PLANET_KITS } from './planetKitRows'
import { MERCHANTS_ROW_ID, sessionPlanetIdOf } from './sessionMerchant'

// The merchant the Sell bay draws (ticket 821, PK2): the variant trading at the session's planet
// once the `merchants` row is open, its premium tag and its id-keyed stock with #681 prices, and
// what each line's Buy would meet (ticket 850), a line held from sale (the GD's ship rule, empty since ticket 882).

/** Docked at the Sell bay of planet `planetIndex` with `money`. */
function dockedSession(planetIndex: number, money: string) {
  const session = createScriptedSession()
  if (planetIndex !== 1) session.submit(0, { type: 'debug.setPlanet', payload: { planetIndex } })
  session.submit(0, { type: 'debug.grantMoney', payload: { amount: money } })
  session.submit(0, { type: 'debug.teleportToDock', payload: { bay: 'sell' } })
  return session
}

const stateOn = (planetIndex: number) =>
  createAuthorityState({ planetIndex, planetSeed: WORLD_SEED, playerIds: ['p1'] })

describe('merchant panel (ticket 821)', () => {
  it('opens the merchants row on planet 1, where the merchant counter stands', () => {
    expect(isFeatureUnlocked(stateOn(1), MERCHANTS_ROW_ID)).toBe(true)
  })

  it('keys the session planet on its stable id (s,p)', () => {
    expect(sessionPlanetIdOf(stateOn(3))).toEqual({ system: '1', planet: '3' })
  })

  it('draws each of the first five planets its own merchant and premium tag', () => {
    const panels = [1, 2, 3, 4, 5].map((planet) =>
      merchantPanelOf(PLANET_KITS, stateOn(planet), 'p1')!,
    )
    expect(panels.map((panel) => panel.name)).toEqual([
      'Hearthmoor Assay',
      'Scree Yard',
      'Gasworks',
      'Lapidary',
      'Boilerhouse',
    ])
    expect(panels[0].premiumTag).toBe('Pays extra for Honey Amber.')
  })

  it('lists the stock by item id with each price’s readout and exact amount', () => {
    const panel = merchantPanelOf(PLANET_KITS, stateOn(5), 'p1')!
    expect(panel.stock.map((line) => line.itemId)).toEqual([
      'scree_plough',
      'shard_tongs',
      'vent_vane',
    ])
    expect(panel.stock[0]).toMatchObject({ priceText: '2,051', exactPrice: '2.050313e+3' })
  })

  it('puts the hover line’s first sentence on the line and the rest, with the carry limit, in the tooltip', () => {
    const [crate] = merchantPanelOf(PLANET_KITS, stateOn(1), 'p1')!.stock
    expect(crate).toMatchObject({
      name: 'Cache Crate',
      oneLine: 'Drop your hold as a crate.',
      tooltipLines: ['Sold only on Hearthmoor.', 'Carry up to 3.'],
    })
  })

  it('draws no merchant where none trades', () => {
    expect(merchantPanelOf(PLANET_KITS, stateOn(6), 'p1')).toBeNull()
    expect(isMerchantTradingHere(PLANET_KITS, stateOn(6))).toBe(false)
    expect(isMerchantTradingHere(PLANET_KITS, stateOn(1))).toBe(true)
  })

  it('locks a tool’s line once owned and a consumable’s once carried to its limit', () => {
    const plough = dockedSession(2, '1e12')
    plough.submit(1, {
      type: 'debug.planet-kit.grantKitItem',
      payload: { itemId: 'scree_plough' },
    } as CommandIntent)
    const [ploughLine] = merchantPanelOf(PLANET_KITS, plough.state(), 'p1')!.stock
    expect(ploughLine).toMatchObject({ lockReason: OWNED_LOCK_REASON, carriedText: null })
    const crates = dockedSession(1, '1e12')
    crates.submit(1, buyKitItemIntent('cache_crate'))
    const [oneCrate] = merchantPanelOf(PLANET_KITS, crates.state(), 'p1')!.stock
    expect(oneCrate).toMatchObject({ lockReason: null, carriedText: '1/3' })
    crates.submit(2, buyKitItemIntent('cache_crate'))
    crates.submit(3, buyKitItemIntent('cache_crate'))
    const [fullCrate] = merchantPanelOf(PLANET_KITS, crates.state(), 'p1')!.stock
    expect(fullCrate).toMatchObject({ lockReason: CARRIED_FULL_LOCK_REASON, carriedText: '3/3' })
  })

  it('turns a price the wallet cannot pay red, leaving Buy open', () => {
    const [poor] = merchantPanelOf(PLANET_KITS, dockedSession(1, '0').state(), 'p1')!.stock
    expect(poor).toMatchObject({ itemId: 'cache_crate', isMoneyShort: true, lockReason: null })
    const [rich] = merchantPanelOf(PLANET_KITS, dockedSession(1, '1e12').state(), 'p1')!.stock
    expect(rich.isMoneyShort).toBe(false)
  })

  it('opens Buy on every hazard tool’s line now each has its verb (ticket 882)', () => {
    const lines = merchantPanelOf(PLANET_KITS, dockedSession(5, '1e12').state(), 'p1')!.stock
    expect(lines.map((line) => [line.itemId, line.lockReason])).toEqual([
      ['scree_plough', null],
      ['shard_tongs', null],
      ['vent_vane', null],
    ])
  })

  it('locks a line held from sale as not on sale yet, the GD’s ship rule kept in data', () => {
    const held = { ...PLANET_KITS, heldFromSale: new Set(['vent_vane']) }
    const lines = merchantPanelOf(held, dockedSession(5, '1e12').state(), 'p1')!.stock
    expect(lines.map((line) => [line.itemId, line.lockReason])).toEqual([
      ['scree_plough', null],
      ['shard_tongs', null],
      ['vent_vane', HELD_FROM_SALE_LOCK_REASON],
    ])
  })
})
