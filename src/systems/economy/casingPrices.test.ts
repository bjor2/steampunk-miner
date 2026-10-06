import { describe, expect, it } from 'vitest'
import { add, ceilMilli, fromCanonical, mul, toCanonical, ZERO_MONEY } from '../money'
import { casingGradeStart, casingLiningPrice, casingUpgradePrice } from './casingPrices'
import { ECONOMY } from './economy'
import { oreTier, oreValue } from './oreEconomy'

describe('casing prices', () => {
  it('starts every vehicle at grade 1', () => {
    expect(casingGradeStart()).toBe(1)
  })

  it('prices grades 1->2 .. 4->5 at 48, 60, 74 and 92, 274 together', () => {
    const prices = [1, 2, 3, 4].map(casingUpgradePrice)
    expect(prices.map(toCanonical)).toEqual(['4.8e+1', '6e+1', '7.4e+1', '9.2e+1'])
    expect(toCanonical(prices.reduce(add, ZERO_MONEY))).toBe('2.74e+2')
  })

  // Systems' value for C1a (#115) under the Sell-bay bill rule, down from 0.30: 0.004 and 0.003
  // left the bot's planet 1 core over 58 min, 0.002 (the floor) met the gates.
  it('reads k_casing as 0.002 of an ore unit per metre of lining', () => {
    expect(toCanonical(ECONOMY.casing.kCasing)).toBe('2e-3')
  })

  it('charges ceilMilli(0.002 * V(t(1,3)) * 10) = 0.45 for 10 m against band 3 on planet 1', () => {
    expect(toCanonical(casingLiningPrice(1, 3, fromCanonical('10')))).toBe('4.5e-1')
  })

  it('follows ceilMilli(k_casing * V(t(p,b)) * lengthM) on every planet and band', () => {
    const lengthM = fromCanonical('0.5')
    for (const planet of [1, 2, 3]) {
      for (const band of [1, 2, 3, 4, 5, 6]) {
        const expected = ceilMilli(
          mul(mul(ECONOMY.casing.kCasing, oreValue(oreTier(planet, band))), lengthM),
        )
        expect(toCanonical(casingLiningPrice(planet, band, lengthM))).toBe(toCanonical(expected))
      }
    }
  })

  it('charges refractory lining 1.5 times the metre price, rounded once (#113)', () => {
    const lengthM = fromCanonical('0.5')
    for (const band of [1, 3, 5]) {
      const metre = mul(ECONOMY.casing.kCasing, oreValue(oreTier(8, band)))
      const expected = ceilMilli(mul(mul(metre, fromCanonical('1.5')), lengthM))
      expect(casingLiningPrice(8, band, lengthM, 'refractory')).toEqual(expected)
    }
    expect(casingLiningPrice(8, 3, lengthM, 'standard')).toEqual(casingLiningPrice(8, 3, lengthM))
  })

  it('rounds a part-milli metre price up to the next milli', () => {
    // V(t(1,4)) = 33.75, so half a metre is 0.03375 before rounding.
    expect(toCanonical(casingLiningPrice(1, 4, fromCanonical('0.5')))).toBe('3.4e-2')
  })

  it('charges nothing for no new lining', () => {
    expect(toCanonical(casingLiningPrice(1, 5, ZERO_MONEY))).toBe('0e+0')
  })
})
