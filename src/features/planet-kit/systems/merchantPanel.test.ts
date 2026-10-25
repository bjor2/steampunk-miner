import { describe, expect, it } from 'vitest'
import { createAuthorityState } from '../../../systems/authority/authorityState'
import { isFeatureUnlocked } from '../../../systems/authority/featureUnlocks'
import { WORLD_SEED } from '../../../systems/authority/scriptedSession'
import { merchantPanelOf, isMerchantTradingHere } from './merchantPanel'
import { PLANET_KITS } from './planetKitRows'
import { MERCHANTS_ROW_ID, sessionPlanetIdOf } from './sessionMerchant'

// The merchant the Sell bay draws (ticket 821, PK2): the variant trading at the session's planet
// once the `merchants` row is open, its premium tag and its id-keyed stock with #681 prices.

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
    const panels = [1, 2, 3, 4, 5].map((planet) => merchantPanelOf(PLANET_KITS, stateOn(planet))!)
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
    const panel = merchantPanelOf(PLANET_KITS, stateOn(5))!
    expect(panel.stock.map((line) => line.itemId)).toEqual([
      'scree_plough',
      'shard_tongs',
      'vent_vane',
    ])
    expect(panel.stock[0]).toMatchObject({ priceText: '2,051', exactPrice: '2.050313e+3' })
  })

  it('puts the hover line’s first sentence on the line and the rest, with the carry limit, in the tooltip', () => {
    const [crate] = merchantPanelOf(PLANET_KITS, stateOn(1))!.stock
    expect(crate).toMatchObject({
      name: 'Cache Crate',
      oneLine: 'Drop your hold as a crate.',
      tooltipLines: ['Sold only on Hearthmoor.', 'Carry up to 3.'],
    })
  })

  it('draws no merchant where none trades', () => {
    expect(merchantPanelOf(PLANET_KITS, stateOn(6))).toBeNull()
    expect(isMerchantTradingHere(PLANET_KITS, stateOn(6))).toBe(false)
    expect(isMerchantTradingHere(PLANET_KITS, stateOn(1))).toBe(true)
  })
})
