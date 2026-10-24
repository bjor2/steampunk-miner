import { describe, expect, it } from 'vitest'
import { PLANET_KITS } from './planetKitRows'
import {
  isKitItemSoldAt,
  kitItemOf,
  kitItemsOfKind,
  merchantOfPlanet,
  premiumTagOf,
  stockOfMerchant,
} from './planetKitSales'

const at = (system: string, planet: string) => ({ system, planet })

describe('planet kit sales (ticket 820)', () => {
  it('sells a consumable on its home planet only', () => {
    const crate = kitItemOf(PLANET_KITS, 'cache_crate')!
    expect(isKitItemSoldAt(crate, at('1', '1'))).toBe(true)
    expect(isKitItemSoldAt(crate, at('1', '2'))).toBe(false)
    expect(isKitItemSoldAt(crate, at('2', '1'))).toBe(false)
  })

  it('sells a tool at its home merchant and at every later one by g, never earlier', () => {
    const tongs = kitItemOf(PLANET_KITS, 'shard_tongs')!
    expect(isKitItemSoldAt(tongs, at('1', '3'))).toBe(false)
    expect(isKitItemSoldAt(tongs, at('1', '4'))).toBe(true)
    expect(isKitItemSoldAt(tongs, at('1', '5'))).toBe(true)
    expect(isKitItemSoldAt(tongs, at('1', '6'))).toBe(true)
    expect(isKitItemSoldAt(tongs, at('2', '1'))).toBe(true)
  })

  it('stocks a generated planet past the first system with every first-system tool', () => {
    expect(stockOfMerchant(PLANET_KITS.items, at('2', '1'))).toEqual([
      'scree_plough',
      'shard_tongs',
      'vent_vane',
    ])
    expect(stockOfMerchant(PLANET_KITS.items, at('1000000', '5'))).toEqual([
      'scree_plough',
      'shard_tongs',
      'vent_vane',
    ])
  })

  it('derives each shipped merchant’s stock in debut order', () => {
    for (const merchant of PLANET_KITS.merchants) {
      expect(stockOfMerchant(PLANET_KITS.items, merchant.planet)).toEqual(merchant.stock)
    }
  })

  it('fills the premium tag with the merchant’s ore, verbatim', () => {
    const tags = PLANET_KITS.merchants.map((merchant) => premiumTagOf(PLANET_KITS, merchant))
    expect(tags).toEqual([
      'Pays extra for Honey Amber.',
      'Pays extra for Moonstone Lens.',
      'Pays extra for Green Apatite.',
      'Pays extra for Rose Quartz.',
      'Pays extra for Chromite.',
    ])
  })

  it('finds a merchant by (s,p) and none on a planet without a kit row', () => {
    expect(merchantOfPlanet(PLANET_KITS, at('1', '3'))?.name).toBe('Gasworks')
    expect(merchantOfPlanet(PLANET_KITS, at('1', '6'))).toBeNull()
    expect(merchantOfPlanet(PLANET_KITS, at('2', '3'))).toBeNull()
  })

  it('splits the items by kind: two consumables, three tools', () => {
    expect(kitItemsOfKind(PLANET_KITS, 'consumable').map((item) => item.id)).toEqual([
      'cache_crate',
      'damp_flask',
    ])
    expect(kitItemsOfKind(PLANET_KITS, 'tool').map((item) => item.id)).toEqual([
      'scree_plough',
      'shard_tongs',
      'vent_vane',
    ])
    expect(kitItemOf(PLANET_KITS, 'scree_hood')).toBeNull()
  })
})
