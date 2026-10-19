import { readdirSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { ceil, cmp, div, fromCanonical, mul, powInt, sub, toCanonical, type Money } from '../money'
import { paceScale } from './planetEconomy'
import { stepPrice, upgradePrice } from './upgradePrices'
import { drillPower, startLevels, vehicleStatsAt } from './vehicleStats'

// Drill power per purchase (GD ruling on #551, ticket 552): D(n) = 1.5 x 1.12^(1/18) x 1.243^(n-1)
// for n >= 1, D(0) = 1.5, and the price of purchase n is ceil(20 x 1.48^(n-1)) x paceScale, 1 at
// n = 0. These are Systems' acceptance list (#551 section 7) on the law and the rows; the bench and
// pacing bars read the swept cut and the bot lane (drillLadder*.test.ts, the pacing lanes).

const m = fromCanonical
const PURCHASES_1_TO_200 = Array.from({ length: 200 }, (_, index) => index + 1)
const PURCHASES_1_TO_300 = Array.from({ length: 300 }, (_, index) => index + 1)
/** Pace 1 on planet 1, 1.2 on 2 and 3, 1.3 from 4, 1.6 from 6, 1.7 from 8 (`paceScale`). */
const PACE_PLANETS = [1, 2, 3, 4, 6, 8, 11]

/** `|value / target - 1| <= tolerance`, in Money. */
function isWithin(value: Money, target: Money, tolerance: Money): boolean {
  const off = sub(div(value, target), m('1'))
  return cmp(off, tolerance) <= 0 && cmp(off, mul(tolerance, m('-1'))) >= 0
}

function gainAt(purchase: number): Money {
  return div(drillPower(purchase + 1), drillPower(purchase))
}

/** Systems' row on #551: purchase 0 costs 1, purchase n costs ceil(20 x 1.48^(n - 1)). */
function lawRowOf(purchase: number): Money {
  return purchase === 0 ? m('1') : ceil(mul(m('20'), powInt(m('1.48'), purchase - 1)))
}

describe('drill power per purchase (#551 law asserts, ticket 552)', () => {
  it('starts at 1.5 and keeps purchase 1 at 1.5095, its old first pip, within 0.1%', () => {
    expect(drillPower(0)).toEqual(m('1.5'))
    expect(isWithin(drillPower(1), m('1.5095'), m('0.001'))).toBe(true)
  })

  it.each([
    [10, '10.69'],
    [20, '94.1'],
    [50, '6.43e4'],
  ])('reaches D(%i) = %s within 1%', (purchase, law) => {
    expect(isWithin(drillPower(purchase), m(law), m('0.01'))).toBe(true)
  })

  it('gains between 1.181 and 1.305 on every purchase from 1 to 200 (the #463 bar since #552)', () => {
    const outside = PURCHASES_1_TO_200.filter(
      (purchase) => cmp(gainAt(purchase), m('1.181')) < 0 || cmp(gainAt(purchase), m('1.305')) > 0,
    )
    expect(outside).toEqual([])
  })

  it('climbs strictly on every purchase from 0 to 200, with no dip', () => {
    const flat = [0, ...PURCHASES_1_TO_200].filter((purchase) => cmp(gainAt(purchase), m('1')) <= 0)
    expect(flat).toEqual([])
  })

  it('puts purchase 20 between 60 and 65 times purchase 1', () => {
    const ratio = div(drillPower(20), drillPower(1))
    expect([cmp(ratio, m('60')) >= 0, cmp(ratio, m('65')) <= 0]).toEqual([true, true])
  })

  // Reading A: today's stored 20 is 1.5 x 1.12^2 under the #180 pip rule.
  it("puts purchase 20 at 50 times the drill today's stored step 20 had, within 1%", () => {
    const today = mul(m('1.5'), powInt(m('1.12'), 2))
    expect(isWithin(div(drillPower(20), today), m('50'), m('0.01'))).toBe(true)
  })
})

describe('drill power price rows (#551 price asserts, ticket 552)', () => {
  it('prices purchase 0 at 1 and purchase 1 at 20 on planet 1', () => {
    expect([stepPrice('drill_power', 0, 1), stepPrice('drill_power', 1, 1)]).toEqual([
      m('1'),
      m('20'),
    ])
  })

  it.each(PACE_PLANETS)(
    'prices purchase n at ceil(20 x 1.48^(n - 1)) x paceScale for n = 0 to 300 on planet %i, with no major split',
    (planetIndex) => {
      const misses = [0, ...PURCHASES_1_TO_300].filter((purchase) => {
        const law = mul(lawRowOf(purchase), paceScale(planetIndex))
        return cmp(stepPrice('drill_power', purchase, planetIndex), law) !== 0
      })
      expect(misses).toEqual([])
    },
  )

  it("answers the workshop's level price with the purchase's own row", () => {
    expect(upgradePrice('drill_power', 37, 3)).toEqual(stepPrice('drill_power', 37, 3))
  })

  // p/s >= 1.00 always (GD ruling point 3): a purchase never costs less, against the one before,
  // than it adds in drill power.
  it('raises every price by at least the drill power its purchase adds, from purchase 1 to 300', () => {
    const cheap = PURCHASES_1_TO_300.filter((purchase) => {
      const priceRatio = div(
        stepPrice('drill_power', purchase, 1),
        stepPrice('drill_power', purchase - 1, 1),
      )
      return cmp(priceRatio, gainAt(purchase)) < 0
    })
    expect(cheap).toEqual([])
  })
})

describe('drill power past purchase 100 (#551 numbers, ticket 552)', () => {
  it('reads 3.4e9 at purchase 100', () => {
    expect(isWithin(drillPower(100), m('3.4e9'), m('0.02'))).toBe(true)
  })

  it.each([100, 1000, 3000])(
    'gives a finite vehicle stat at purchase %i that round-trips as canonical text',
    (purchase) => {
      const { drillPower: power } = vehicleStatsAt({ ...startLevels(), drill_power: purchase })
      expect(fromCanonical(toCanonical(power))).toEqual(power)
      expect(toCanonical(power)).toMatch(/^\d\.\d+e\+\d+$/)
    },
  )

  it('keeps the shop rows from purchase 1 to 3000 whole and climbing on planet 1', () => {
    const misses: number[] = []
    let before = stepPrice('drill_power', 0, 1)
    for (let purchase = 1; purchase <= 3000; purchase++) {
      const price = stepPrice('drill_power', purchase, 1)
      if (cmp(price, before) <= 0 || cmp(ceil(price), price) !== 0) misses.push(purchase)
      before = price
    }
    expect(misses).toEqual([])
  })
})

const SRC = new URL('../../', import.meta.url)
const STAT_NAMES = /drillPower|drillTip|gateTip|hullMax/
/** `Number(` or `parseFloat(` wrapped round a stat: a double past 1e308 is Infinity (#340). */
const NUMBER_OF_STAT = /(?:Number|parseFloat)\(([^()]*(?:\([^()]*\))?[^()]*)\)/g

function gameSourceFiles(): string[] {
  return readdirSync(SRC, { recursive: true, encoding: 'utf8' })
    .map((path) => path.replaceAll('\\', '/'))
    .filter((path) => /\.tsx?$/.test(path) && !/\.test\.tsx?$/.test(path))
}

function numbersOfStatsIn(path: string): string[] {
  const code = readFileSync(new URL(path, SRC), 'utf8')
  return [...code.matchAll(NUMBER_OF_STAT)]
    .filter((match) => STAT_NAMES.test(match[1]))
    .map((match) => `${path}: ${match[0]}`)
}

describe('drill power as a double (#551 numbers, ticket 552)', () => {
  it('is never turned into a Number in game code, which D past purchase 3260 would overflow', () => {
    expect(gameSourceFiles().flatMap(numbersOfStatsIn)).toEqual([])
  })
})
