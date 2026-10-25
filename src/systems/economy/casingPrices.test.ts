import { describe, expect, it } from 'vitest'
import { add, ceilMilli, fromCanonical, mul, toCanonical, ZERO_MONEY } from '../money'
import { casingGradeStart, casingLiningPrice, casingUpgradePrice } from './casingPrices'
import { geometricCurveOf } from './costCurveLookup'
import { ECONOMY } from './economy'
import { oreTier, oreValue } from './oreEconomy'

describe('casing prices', () => {
  it('starts every vehicle at grade 1', () => {
    expect(casingGradeStart()).toBe(1)
  })

  // #894 (Bjor's playtest, GD lock 25 Oct): P1's pins lift with the base, 48 -> 240.
  it('prices grades 1->2 .. 4->5 at 240, 294, 361 and 442, 1337 together', () => {
    const prices = [1, 2, 3, 4].map(casingUpgradePrice)
    expect(prices.map(toCanonical)).toEqual(['2.4e+2', '2.94e+2', '3.61e+2', '4.42e+2'])
    expect(toCanonical(prices.reduce(add, ZERO_MONEY))).toBe('1.337e+3')
  })

  it('keeps the ladder at 1.225 a grade: five times the 48 base at every grade, before the ceil', () => {
    const curve = geometricCurveOf(ECONOMY.casing.costCurveId)
    expect(toCanonical(curve.ratio)).toBe('1.225e+0')
    expect(toCanonical(curve.base)).toBe(toCanonical(mul(fromCanonical('48'), fromCanonical('5'))))
  })

  // Systems' value for C1a (#115) was 0.002, the floor that met the gates under the Sell-bay bill
  // rule; #894 multiplies it by ten.
  it('reads k_casing as 0.02 of an ore unit per metre of lining, ten times #115s 0.002', () => {
    expect(toCanonical(ECONOMY.casing.kCasing)).toBe('2e-2')
    const raised = mul(fromCanonical('0.002'), fromCanonical('10'))
    expect(toCanonical(ECONOMY.casing.kCasing)).toBe(toCanonical(raised))
  })

  it('charges ceilMilli(0.02 * V(t(1,3)) * 10) = 4.5 for 10 m against band 3 on planet 1', () => {
    expect(toCanonical(casingLiningPrice(1, 3, fromCanonical('10')))).toBe('4.5e+0')
  })

  it('records the casing rise as economy rules 4', () => {
    expect(ECONOMY.economyRulesVersion).toBe(4)
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
    // V(t(1,4)) = 33.75, so a fiftieth of a metre is 0.0135 before rounding.
    expect(toCanonical(casingLiningPrice(1, 4, fromCanonical('0.02')))).toBe('1.4e-2')
  })

  it('charges nothing for no new lining', () => {
    expect(toCanonical(casingLiningPrice(1, 5, ZERO_MONEY))).toBe('0e+0')
  })
})

// The #894 goldens: one metre of first-placed lining against band 1 and band 5, and the grade buy
// from q, at g = 1, 5, 40 and 1e6, in bignum, uncapped.
describe('casing price goldens (#894)', () => {
  it.each([
    [1, '2e-1', '1.013e+0'],
    [5, '2.595e+1', '1.31369e+2'],
    [40, '8.0113795068923391719923e+19', '4.05576087536424670582108e+20'],
    [
      1e6,
      '3.547507009276947994774432685143647264148e+528272',
      '1.795925423446454922354556546853971427474e+528273',
    ],
  ])(
    'prices a metre of lining on planet %d at %s in band 1 and %s in band 5',
    (g, band1, band5) => {
      const metre = fromCanonical('1')
      expect(toCanonical(casingLiningPrice(g, 1, metre))).toBe(band1)
      expect(toCanonical(casingLiningPrice(g, 5, metre))).toBe(band5)
    },
  )

  it.each([
    [1, '2.4e+2'],
    [5, '5.41e+2'],
    [40, '6.5693e+5'],
    [1e6, '2.403121363455316029949273528453387317677e+88138'],
  ])('prices the buy from casing grade %d at %s', (grade, price) => {
    expect(toCanonical(casingUpgradePrice(grade))).toBe(price)
  })
})
