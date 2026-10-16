import { describe, expect, it } from 'vitest'
import {
  oreHardness,
  oreSalePrice,
  oreTier,
  signatureHardness,
} from '../../../systems/economy/oreEconomy'
import { cargoCapacity, onCurveLevel } from '../../../systems/economy/vehicleStats'
import { cmp, fromSafeInteger, mul, toCanonical } from '../../../systems/money'
import { BAND_COUNT } from '../../../systems/world/planetGeometry'
import { oreTierOf } from './oreCatalogue'
import { ORE_ROWS } from './oreRows'
import { RARITY_ROW_SETS } from './rarityRows'
import {
  isTierLiveIn,
  mixedRowsFromPlanet,
  ORE_RULES_VERSION,
  rarityMultiplierOf,
  rarityRowSetOf,
  rarityTiers,
  rarityWeightBpOf,
} from './rarityTiers'

const BANDS = [1, 2, 3, 4, 5]
const PLANETS = Array.from({ length: 200 }, (_, at) => at + 1)
const RATED_OFFSETS = [1, 2, 3, 4]
/** #141: commons are at least 82% of a band. */
const COMMONS_FLOOR_BP = 8200

function drawnBp(set: 'legacy' | 'mixed', band: number): number {
  return RATED_OFFSETS.reduce((sum, offset) => sum + rarityWeightBpOf(set, offset, band), 0)
}

describe('rarity tiers', () => {
  it('draws the legacy weights on P1 and P2 and on any planet saved without the ore rules', () => {
    expect(rarityRowSetOf(1, ORE_RULES_VERSION)).toBe('legacy')
    expect(rarityRowSetOf(2, ORE_RULES_VERSION)).toBe('legacy')
    expect(rarityRowSetOf(5, undefined)).toBe('legacy')
    expect(rarityRowSetOf(40, undefined)).toBe('legacy')
  })

  it('draws the mixed weights on new planets from P3, where epic and mythic start', () => {
    expect(mixedRowsFromPlanet()).toBe(3)
    expect(rarityRowSetOf(3, ORE_RULES_VERSION)).toBe('mixed')
    expect(rarityRowSetOf(200, ORE_RULES_VERSION)).toBe('mixed')
  })

  it('multiplies value by 1, 1.5, 2.25, 3.375 and 5.0625 from common to mythic', () => {
    const multipliers = rarityTiers().map((tier) =>
      toCanonical(rarityMultiplierOf(tier.tierOffset)),
    )
    expect(multipliers).toEqual(['1e+0', '1.5e+0', '2.25e+0', '3.375e+0', '5.0625e+0'])
  })

  it('keeps every band within 10000 bp with no negative weight', () => {
    for (const set of RARITY_ROW_SETS) {
      for (const band of BANDS) {
        expect(drawnBp(set, band)).toBeLessThanOrEqual(10000)
        for (const offset of RATED_OFFSETS)
          expect(rarityWeightBpOf(set, offset, band)).toBeGreaterThanOrEqual(0)
      }
    }
  })

  it('draws no tier above its first band nor before its first planet', () => {
    for (const planetIndex of PLANETS) {
      for (const band of BANDS) {
        const set = rarityRowSetOf(planetIndex, ORE_RULES_VERSION)
        const dead = rarityTiers().filter((tier) => !isTierLiveIn(tier, planetIndex, band))
        for (const tier of dead) {
          if (tier.tierOffset > 0) expect(rarityWeightBpOf(set, tier.tierOffset, band)).toBe(0)
        }
      }
    }
  })

  it('leaves commons at least 82% of every band, even with the signature at its cap', () => {
    for (const set of RARITY_ROW_SETS) {
      for (const band of BANDS) {
        const signatureCapBp = ORE_ROWS.signatureShareCapBpByBand[String(band)] ?? 0
        expect(10000 - drawnBp(set, band) - signatureCapBp).toBeGreaterThanOrEqual(COMMONS_FLOOR_BP)
      }
    }
  })

  it('prices a cell at its band tier plus its offset, and a common at its band tier', () => {
    for (const planetIndex of [1, 10, 20, 40, 60]) {
      for (const band of BANDS) {
        expect(oreTierOf(planetIndex, band, 0)).toBe(oreTier(planetIndex, band))
        for (const offset of RATED_OFFSETS)
          expect(oreTierOf(planetIndex, band, offset)).toBe(oreTier(planetIndex, band) + offset)
      }
    }
  })

  it('holds the sale price goldens of the band-1 common and the band-5 mythic up to tier 186', () => {
    const goldens = [1, 10, 20, 40, 60].map((planetIndex) => [
      toCanonical(oreSalePrice(oreTierOf(planetIndex, 1, 0))),
      toCanonical(oreSalePrice(oreTierOf(planetIndex, BAND_COUNT, 4))),
    ])
    expect(oreTierOf(60, BAND_COUNT, 4)).toBe(186)
    expect(goldens).toEqual([
      ['1e+1', '2.56289e+2'],
      ['5.68151286e+5', '1.456109606e+7'],
      ['1.08943611013134e+11', '2.792105593192101e+12'],
      ['4.005689753446169585996124e+21', '1.02661447157657494741095976e+23'],
      ['1.47283078389324634435640274710586794e+32', '3.774704208251402056766546259281874845e+33'],
    ])
  })

  it('keeps one find within 15% of an on-curve hold wherever its tier is drawn', () => {
    // m / (C - 1 + m) <= 0.15 is C >= 1 + (8500 / 1500) m (Systems, #139 comment 6202970624).
    const shareBp = ORE_ROWS.rarity.tripClampShareBp
    for (const planetIndex of PLANETS) {
      const hold = cargoCapacity(onCurveLevel('cargo_hold', planetIndex))
      const live = rarityTiers().filter((tier) => isTierLiveIn(tier, planetIndex, BAND_COUNT))
      for (const tier of live) {
        const find = mul(fromSafeInteger(10000 - shareBp), rarityMultiplierOf(tier.tierOffset))
        const room = fromSafeInteger(shareBp * (hold - 1))
        expect(cmp(find, room)).toBeLessThanOrEqual(0)
      }
    }
  })

  it('is never harder than the drill-gated signature of its planet', () => {
    for (const planetIndex of PLANETS) {
      const signature = signatureHardness(oreTier(planetIndex, BAND_COUNT))
      for (const band of BANDS) {
        const hardest = oreHardness(oreTierOf(planetIndex, band, RATED_OFFSETS.length))
        expect(cmp(hardest, signature)).toBeLessThanOrEqual(0)
      }
    }
  })
})
