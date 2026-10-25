import { describe, expect, it } from 'vitest'
import { merchantVariantOf } from './merchantVariant'
import { PLANET_KITS } from './planetKitRows'

const at = (system: string, planet: string) => ({ system, planet })
const FIRST_FIVE = ['1', '2', '3', '4', '5'].map((planet) => at('1', planet))

describe('merchant variants (ticket 821)', () => {
  it('gives each of the five open planets its own merchant variant', () => {
    expect(FIRST_FIVE.map((planet) => merchantVariantOf(PLANET_KITS, planet)?.name)).toEqual([
      'Hearthmoor Assay',
      'Scree Yard',
      'Gasworks',
      'Lapidary',
      'Boilerhouse',
    ])
  })

  it('differs from merchant to merchant in stock and buy list only', () => {
    const variants = FIRST_FIVE.map((planet) => merchantVariantOf(PLANET_KITS, planet)!)
    expect(variants.map((variant) => variant.buysPool)).toEqual([
      'legacy',
      'foothold-p2',
      'foothold-p3',
      'foothold-p4',
      'foothold-p5',
    ])
    expect(new Set(variants.map((variant) => variant.premiumLiftBp))).toEqual(new Set([2500]))
  })

  it('stocks a tool at its home merchant and every later one, a consumable at home only', () => {
    expect(
      FIRST_FIVE.map((planet) =>
        merchantVariantOf(PLANET_KITS, planet)!.stock.map((row) => row.itemId),
      ),
    ).toEqual([
      ['cache_crate'],
      ['scree_plough'],
      ['scree_plough', 'damp_flask'],
      ['scree_plough', 'shard_tongs'],
      ['scree_plough', 'shard_tongs', 'vent_vane'],
    ])
  })

  it('shows each stock row’s price through the compact formatter, rounded up', () => {
    expect(
      FIRST_FIVE.map((planet) =>
        merchantVariantOf(PLANET_KITS, planet)!.stock.map(
          (row) => `${row.itemId} ${row.priceText}`,
        ),
      ),
    ).toEqual([
      ['cache_crate 50.7'],
      ['scree_plough 2,051'],
      ['scree_plough 2,051', 'damp_flask 1,154'],
      ['scree_plough 2,051', 'shard_tongs 25.4k'],
      ['scree_plough 2,051', 'shard_tongs 25.4k', 'vent_vane 94.6k'],
    ])
  })

  it('carries the consumables’ stack limit on their rows and none on a tool', () => {
    const gasworks = merchantVariantOf(PLANET_KITS, at('1', '3'))!
    expect(gasworks.stock.map((row) => [row.itemId, row.kind, row.stackLimit])).toEqual([
      ['scree_plough', 'tool', null],
      ['damp_flask', 'consumable', 3],
    ])
  })

  it('names its premium ore in Progression’s tag', () => {
    expect(merchantVariantOf(PLANET_KITS, at('1', '1'))!.premiumTag).toBe(
      'Pays extra for Honey Amber.',
    )
  })

  it('places no merchant where the rows have none', () => {
    expect(merchantVariantOf(PLANET_KITS, at('1', '6'))).toBeNull()
  })
})
