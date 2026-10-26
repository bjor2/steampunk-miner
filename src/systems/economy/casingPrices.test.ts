import { describe, expect, it } from 'vitest'
import { add, ceilMilli, cmp, fromCanonical, mul, sub, toCanonical, ZERO_MONEY } from '../money'
import {
  casingGradeStart,
  casingLiningPrice,
  casingUnlockPrice,
  casingUpgradePrice,
  LADDER_ANCHOR_GRADE,
  liningMetrePrice,
} from './casingPrices'
import { requiredCasingGrade } from './casingGrades'
import { geometricCurveOf } from './costCurveLookup'
import { ECONOMY } from './economy'
import { oreTier, oreValue } from './oreEconomy'

describe('casing prices', () => {
  it('starts every vehicle at grade 1', () => {
    expect(casingGradeStart()).toBe(1n)
  })

  // #894 (Bjor's playtest, GD lock 25 Oct): P1's pins lift with the base, 48 -> 240.
  it('prices grades 1->2 .. 4->5 at 240, 294, 361 and 442, 1337 together', () => {
    const prices = [1n, 2n, 3n, 4n].map(casingUpgradePrice)
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

  it('records the ladder of grades by depth as economy rules 7', () => {
    expect(ECONOMY.economyRulesVersion).toBe(7)
  })

  it('follows ceilMilli(k_casing * V(t(p,b)) * lengthM) wherever the wall needs grade 5 or less', () => {
    const lengthM = fromCanonical('0.5')
    const atMostFive = [
      ...[1, 2, 3, 4, 5, 6].map((band) => ({ planet: 1, band })),
      { planet: 2, band: 1 },
    ]
    for (const { planet, band } of atMostFive) {
      {
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
      const metre = liningMetrePrice(8, band)
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

describe('casing prices on the ladder (ticket 829)', () => {
  it("anchors the ladder at grade 5, the first planet's bottom grade", () => {
    expect(LADDER_ANCHOR_GRADE).toBe(5n)
  })

  it('prices grade 6 on as grade 5 times 3.375^(1/4) a grade, rounded up once', () => {
    expect([5n, 6n, 7n, 8n, 9n].map((grade) => toCanonical(casingUnlockPrice(grade)))).toEqual([
      '4.42e+2',
      '6e+2',
      '8.13e+2',
      '1.101e+3',
      '1.492e+3',
    ])
  })

  it('makes every fourth grade 3.375 times the one a planet before, to the rounding up', () => {
    const ratio = ECONOMY.casing.planetPriceRatio
    for (const grade of [9n, 37n, 101n]) {
      const exact = mul(casingUnlockPrice(grade), ratio)
      const gap = sub(casingUnlockPrice(grade + 4n), exact)
      expect(cmp(gap, ratio) <= 0 && cmp(gap, sub(ZERO_MONEY, ratio)) >= 0).toBe(true)
    }
  })

  it('gives the start grade away and charges the buy from grade G the unlock of G + 1', () => {
    expect(casingUnlockPrice(1n)).toEqual(ZERO_MONEY)
    expect(casingUpgradePrice(8n)).toEqual(casingUnlockPrice(9n))
  })

  it('prices a metre past grade 5 as planet 1 band 5s metre times r per grade, whatever the planet', () => {
    const anchorMetre = liningMetrePrice(1, 5)
    expect(liningMetrePrice(2, 5)).toEqual(mul(anchorMetre, fromCanonical('3.375')))
    expect(liningMetrePrice(3, 5)).toEqual(mul(anchorMetre, fromCanonical('11.390625')))
  })

  it('prices the metre by the grade the wall needs, so the same band costs more a planet on', () => {
    for (const band of [2, 3, 4, 5]) {
      expect(cmp(liningMetrePrice(3, band), liningMetrePrice(2, band))).toBe(1)
      expect(requiredCasingGrade({ planetIndex: 3, band }) > 5n).toBe(true)
    }
  })
})

// The #894 goldens, re-pinned by ticket 829's ladder: one metre of first-placed lining against
// band 1 and band 5, and the grade buy from q, at g = 1, 5, 40 and 1e6, in bignum, uncapped.
describe('casing price goldens (#894, ticket 829)', () => {
  it.each([
    [1, '2e-1', '1.013e+0'],
    [5, '3.8924e+1', '1.31369e+2'],
    [40, '1.20170692603385087579884e+20', '4.05576087536424670582108e+20'],
    [
      1e6,
      '5.32126051391542199216164902771547089622e+528272',
      '1.795925423446454922354556546853971427475e+528273',
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
    [1n, '2.4e+2'],
    [5n, '6e+2'],
    [40n, '2.5112287e+7'],
    [1_000_000n, '3.642841312189668047609874603189744528471e+132070'],
  ])('prices the buy from casing grade %d at %s', (grade, price) => {
    expect(toCanonical(casingUpgradePrice(grade))).toBe(price)
  })
})
