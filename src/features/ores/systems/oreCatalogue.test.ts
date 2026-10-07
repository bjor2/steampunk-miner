import { describe, expect, it } from 'vitest'
import { oreHardness, oreSalePrice } from '../../../systems/economy/oreEconomy'
import { toCanonical } from '../../../systems/money'
import { RESOURCE_FAMILY } from '../../../systems/world/worldCell'
import {
  echoOf,
  familyOfCellCode,
  gradeOf,
  leadWeights,
  oreFamilies,
  oreTierOf,
  oreTypeOf,
  variantOf,
} from './oreCatalogue'

const BANDS = [1, 2, 3, 4, 5]
const CAMPAIGN_TIERS = Array.from({ length: 124 }, (_, at) => at + 1)

/** #140: the expected value per ore unit is `1 + 0.5 plus1 + 1.25 plus2` times V(t). */
function expectedValueMultiplier(band: number): number {
  const { plus1Bp, plus2Bp } = leadWeights(band)
  return 1 + (0.5 * plus1Bp + 1.25 * plus2Bp) / 10000
}

describe('ore catalogue', () => {
  it('names a type by family and tier, and its grade and family by name', () => {
    expect(oreTypeOf('radioactive', 12)).toEqual({
      id: 'radioactive_t12',
      name: 'Crystal Pitchglow',
      family: 'radioactive',
      tier: 12,
      grade: 3,
      variant: 3,
      echo: 0,
    })
    expect(oreTypeOf('metal', 1).name).toBe('Raw Brassvein')
  })

  it("grades tiers on #151's thresholds: G1 1-3, G2 4-11, G3 12-29, G4 30-69, G5 70+", () => {
    const firstTierOfGrade = [1, 4, 12, 30, 70]
    firstTierOfGrade.forEach((tier, at) => {
      expect(gradeOf(tier)).toBe(at + 1)
      if (tier > 1) expect(gradeOf(tier - 1)).toBe(at)
    })
  })

  it('never gives two neighbouring tiers of one family the same variant', () => {
    CAMPAIGN_TIERS.slice(1).forEach((tier) => {
      expect(variantOf(tier)).not.toBe(variantOf(tier - 1))
      expect(variantOf(tier)).toBe((tier - 1) % 4)
    })
  })

  it("echoes on #151's locked rule: 0 below tier 97, then 1 more every 24 tiers", () => {
    expect([96, 97, 120, 121].map(echoOf)).toEqual([0, 1, 1, 2])
    expect([1, 124, 145, 169].map(echoOf)).toEqual([0, 2, 3, 4])
  })

  it('puts tier 3(p-1) + b + lead under band b of planet p', () => {
    expect(oreTierOf(1, 1, 0)).toBe(1)
    expect(oreTierOf(2, 1, 0)).toBe(oreTierOf(1, 4, 0))
    expect(oreTierOf(3, 5, 2)).toBe(oreTierOf(4, 4, 0))
    expect(oreTierOf(40, 5, 2)).toBe(124)
  })

  it('prices and hardens two families at the same tier identically: family is look only', () => {
    for (const tier of [1, 7, 25, 124]) {
      const tiers = oreFamilies().map((family) => oreTypeOf(family.id, tier).tier)
      const prices = new Set(tiers.map((at) => toCanonical(oreSalePrice(at))))
      const hardnesses = new Set(tiers.map((at) => toCanonical(oreHardness(at))))
      expect([prices.size, hardnesses.size]).toEqual([1, 1])
    }
  })

  it("rolls rarer leads deeper: #140's weights halved by its pace fallback, at most +4.2% value", () => {
    expect(BANDS.map((band) => leadWeights(band))).toEqual([
      { plus1Bp: 250, plus2Bp: 0 },
      { plus1Bp: 300, plus2Bp: 0 },
      { plus1Bp: 350, plus2Bp: 50 },
      { plus1Bp: 400, plus2Bp: 100 },
      { plus1Bp: 450, plus2Bp: 150 },
    ])
    const multipliers = BANDS.map(expectedValueMultiplier)
    ;[1.0125, 1.015, 1.02375, 1.0325, 1.04125].forEach((spec, at) =>
      expect(multipliers[at]).toBeCloseTo(spec, 4),
    )
  })

  it('lists the 12 families of #141 with metal and crystal on the codes the kernel writes', () => {
    expect(oreFamilies().map((family) => family.id)).toEqual([
      'metal',
      'crystal',
      'fossil',
      'relic',
      'volcanic',
      'radioactive',
      'cryo',
      'organic',
      'alien',
      'energy',
      'ancient',
      'exotic',
    ])
    expect(familyOfCellCode(RESOURCE_FAMILY.metal)?.id).toBe('metal')
    expect(familyOfCellCode(RESOURCE_FAMILY.crystal)?.id).toBe('crystal')
    expect(familyOfCellCode(RESOURCE_FAMILY.none)).toBeNull()
  })

  it('refuses a family it does not know and a tier below 1', () => {
    expect(() => oreTypeOf('mithril', 3)).toThrow(RangeError)
    expect(() => oreTypeOf('metal', 0)).toThrow(RangeError)
  })
})
