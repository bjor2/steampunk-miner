import { describe, expect, it } from 'vitest'
import { cmp, div, fromCanonical, fromSafeInteger, mul, powInt, sub, type Money } from '../money'
import {
  blockHardness,
  coreHardness,
  coreMaterialTier,
  oreHardness,
  oreSalePrice,
  oreTier,
  oreValue,
} from './oreEconomy'

const m = fromCanonical
const PLANETS_1_TO_40 = Array.from({ length: 40 }, (_, index) => index + 1)

/** Money keeps 40 digits (#5), so a ratio of two rounded values may differ in the last ones. */
function agreesTo35Digits(actual: Money, expected: Money): boolean {
  const tolerance = mul(expected, m('1e-35'))
  const difference = sub(actual, expected)
  return cmp(difference, tolerance) <= 0 && cmp(sub(expected, actual), tolerance) <= 0
}

describe('ore economy', () => {
  it('numbers ore tiers 3 per planet: planet 1 bands are 1 to 5, planet 2 bands are 4 to 8', () => {
    expect([1, 2, 3, 4, 5].map((band) => oreTier(1, band))).toEqual([1, 2, 3, 4, 5])
    expect([1, 2, 3, 4, 5].map((band) => oreTier(2, band))).toEqual([4, 5, 6, 7, 8])
    expect(coreMaterialTier(1)).toBe(6)
  })

  it('starts every planet on the ore of the previous planet band 4 (arrival rule)', () => {
    for (const planet of PLANETS_1_TO_40.slice(1)) {
      expect(oreTier(planet, 1)).toBe(oreTier(planet - 1, 4))
    }
  })

  it('values tier 1 ore at 10 and grows each tier by 1.5', () => {
    expect(oreValue(1)).toEqual(m('10'))
    expect(oreValue(6)).toEqual(m('75.9375'))
  })

  it('sells one ore unit at its value floored to 0.001, so 7 tier-6 units bring 531.559', () => {
    expect(oreSalePrice(6)).toEqual(m('75.937'))
    expect(mul(oreSalePrice(6), fromSafeInteger(7))).toEqual(m('531.559'))
  })

  it('grows ore value 3.375x and hardness 1.2544^3 per planet in every band', () => {
    for (const planet of PLANETS_1_TO_40) {
      for (const band of [1, 3, 5]) {
        const next = oreTier(planet + 1, band)
        const here = oreTier(planet, band)
        expect(agreesTo35Digits(div(oreValue(next), oreValue(here)), m('3.375'))).toBe(true)
        const hardnessRatio = div(oreHardness(next), oreHardness(here))
        expect(agreesTo35Digits(hardnessRatio, powInt(m('1.2544'), 3))).toBe(true)
      }
    }
  })

  it('makes tier 1 hardness 1 and the planet 1 core 4 times its band 5 hardness', () => {
    expect(blockHardness(1, 1)).toEqual(m('1'))
    expect(coreHardness(1)).toEqual(mul(m('4'), blockHardness(1, 5)))
  })

  it('refuses a band outside 1 to 6 or a planet below 1', () => {
    expect(() => oreTier(1, 0)).toThrow(RangeError)
    expect(() => oreTier(1, 7)).toThrow(RangeError)
    expect(() => oreTier(0, 1)).toThrow(RangeError)
    expect(() => oreTier(1.5, 1)).toThrow(RangeError)
  })
})
