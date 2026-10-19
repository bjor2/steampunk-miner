import { describe, expect, it } from 'vitest'
import {
  add,
  ceil,
  cmp,
  div,
  fromCanonical,
  fromFiniteNumber,
  fromSafeInteger,
  mul,
  powInt,
  sub,
  type Money,
} from '../money'
import { ECONOMY } from './economy'
import { paceScale } from './planetEconomy'
import { stepPrice, upgradePrice } from './upgradePrices'
import { isPerPurchaseTrack } from './upgradeSteps'
import { cargoCapacity, energyMax, engineStats, rescueEnergyFloor } from './vehicleStats'
import { quantaOfUnits } from '../vehicle/energyQuanta'

// The hold, the boiler and the engine per purchase (ticket 553: Systems' rows on #553, comment
// 6258422139, and the Producer's addendum 6258446174), with the GD's ruling of no max level:
// holdUnits(c) = round(10 x 1.10^c) for ceil(2.4 x 1.20^c) x paceScale, energyMax(b) =
// round(150 x 1.10^b) for ceil(2.4 x 1.20^b) x paceScale, speedMax(e) = 6 x 1.05^e, accel(e) =
// 1.0 x 1.05^e and thrustToWeight(e) = 1 + 1.05^e for ceil(3.6 x 1.60^e) x paceScale.

const m = fromCanonical
const PURCHASES_0_TO_200 = Array.from({ length: 201 }, (_, purchase) => purchase)
/** Pace 1 on planet 1, 1.2 on 2 and 3, 1.3 from 4, 1.6 from 6 and 1.7 from 8 (`paceScale`). */
const PACE_PLANETS = [1, 2, 3, 4, 6, 8, 40]
const ENGINE_GROWTH = m('1.05')

function holdLawOf(purchase: number): Money {
  return mul(m('10'), powInt(m('1.10'), purchase))
}

function boilerLawOf(purchase: number): Money {
  return mul(m('150'), powInt(m('1.10'), purchase))
}

/** The hold's and the boiler's price row: both are `ceil(2.4 x 1.20^n)` before the pace. */
function holdPriceRowOf(purchase: number): Money {
  return ceil(mul(m('2.4'), powInt(m('1.20'), purchase)))
}

function enginePriceRowOf(purchase: number): Money {
  return ceil(mul(m('3.6'), powInt(m('1.60'), purchase)))
}

/** Within one part in a million of the law: the engine's stats are handed on in millionths. */
function isWithinMillionth(value: number, target: Money): boolean {
  const ratio = div(fromFiniteNumber(value), target)
  return cmp(ratio, m('0.999999')) >= 0 && cmp(ratio, m('1.000001')) <= 0
}

/** `|units - law| <= 1/2`: the units are the law rounded to a whole number. */
function isRoundedLaw(units: number, law: Money): boolean {
  const off = sub(fromSafeInteger(units), law)
  return cmp(off, m('0.5')) <= 0 && cmp(off, m('-0.5')) >= 0
}

describe('hold row per purchase (ticket 553)', () => {
  it('holds round(10 x 1.10^c) units after c purchases, from 0 to 200', () => {
    const misses = PURCHASES_0_TO_200.filter(
      (purchase) => !isRoundedLaw(cargoCapacity(purchase), holdLawOf(purchase)),
    )
    expect(misses).toEqual([])
    expect(PURCHASES_0_TO_200.slice(0, 8).map((purchase) => cargoCapacity(purchase))).toEqual([
      10, 11, 12, 13, 15, 16, 18, 19,
    ])
  })

  it('grows on every purchase, so no hold purchase is dead by rounding', () => {
    const flat = PURCHASES_0_TO_200.filter((c) => cargoCapacity(c + 1) <= cargoCapacity(c))
    expect(flat).toEqual([])
  })

  it('prices its first purchase at 3, as the old first hold step did', () => {
    expect(stepPrice('cargo_hold', 0, 1)).toEqual(m('3'))
  })

  it.each(PACE_PLANETS)(
    'prices purchase c at ceil(2.4 x 1.20^c) x paceScale for c = 0 to 200 on planet %i',
    (planetIndex) => {
      const misses = PURCHASES_0_TO_200.filter((purchase) => {
        const law = mul(holdPriceRowOf(purchase), paceScale(planetIndex))
        return cmp(stepPrice('cargo_hold', purchase, planetIndex), law) !== 0
      })
      expect(misses).toEqual([])
    },
  )

  // p/s = 1.20 / 1.10 = 1.09 on the rows (Systems); rounding makes purchases 0 and 3 cheaper, each
  // against the one before, than the units they add, and every purchase from 4 on keeps p/s >= 1.
  it('raises every price from purchase 4 to 200 by at least the units its purchase adds', () => {
    const cheap = PURCHASES_0_TO_200.slice(4).filter((purchase) => {
      const priceRatio = div(
        stepPrice('cargo_hold', purchase + 1, 1),
        stepPrice('cargo_hold', purchase, 1),
      )
      const unitRatio = div(
        fromSafeInteger(cargoCapacity(purchase + 1)),
        fromSafeInteger(cargoCapacity(purchase)),
      )
      return cmp(priceRatio, unitRatio) < 0
    })
    expect(cheap).toEqual([])
  })

  it('keeps p/s at or above 1 on the unrounded rows at every purchase from 0 to 200', () => {
    const cheap = PURCHASES_0_TO_200.filter((purchase) => {
      const priceRatio = div(powInt(m('1.20'), purchase + 1), powInt(m('1.20'), purchase))
      const unitRatio = div(holdLawOf(purchase + 1), holdLawOf(purchase))
      return cmp(priceRatio, unitRatio) < 0
    })
    expect(cheap).toEqual([])
  })
})

describe('boiler row per purchase (ticket 553)', () => {
  it('holds round(150 x 1.10^b) units of energy after b purchases, from 0 to 200', () => {
    const misses = PURCHASES_0_TO_200.filter(
      (purchase) => !isRoundedLaw(energyMax(purchase), boilerLawOf(purchase)),
    )
    expect(misses).toEqual([])
    expect(PURCHASES_0_TO_200.slice(0, 6).map((purchase) => energyMax(purchase))).toEqual([
      150, 165, 182, 200, 220, 242,
    ])
    expect(energyMax(16)).toBe(689)
  })

  it('grows on every purchase, so no boiler purchase is dead by rounding', () => {
    const flat = PURCHASES_0_TO_200.filter((b) => energyMax(b + 1) <= energyMax(b))
    expect(flat).toEqual([])
  })

  // Systems' range: 240 quanta a unit stay a safe integer to b = 275, tested to b = 200.
  it('keeps the tank in quanta and the rescue floor safe integers at purchase 200', () => {
    expect(Number.isSafeInteger(quantaOfUnits(energyMax(200)))).toBe(true)
    expect(cmp(rescueEnergyFloor(200), fromSafeInteger(energyMax(200)))).toBeLessThan(0)
  })

  it('prices its first purchase at 3, as the old first boiler step did', () => {
    expect(stepPrice('boiler', 0, 1)).toEqual(m('3'))
  })

  it.each(PACE_PLANETS)(
    'prices purchase b at ceil(2.4 x 1.20^b) x paceScale for b = 0 to 200 on planet %i',
    (planetIndex) => {
      const misses = PURCHASES_0_TO_200.filter((purchase) => {
        const law = mul(holdPriceRowOf(purchase), paceScale(planetIndex))
        return cmp(stepPrice('boiler', purchase, planetIndex), law) !== 0
      })
      expect(misses).toEqual([])
    },
  )

  it('keeps p/s at or above 1 on the unrounded rows at every purchase from 0 to 200', () => {
    const cheap = PURCHASES_0_TO_200.filter((purchase) => {
      const priceRatio = div(powInt(m('1.20'), purchase + 1), powInt(m('1.20'), purchase))
      const tankRatio = div(boilerLawOf(purchase + 1), boilerLawOf(purchase))
      return cmp(priceRatio, tankRatio) < 0
    })
    expect(cheap).toEqual([])
  })
})

describe('engine row per purchase (ticket 553)', () => {
  it('keeps the starting engine at 6 m/s, accel 1.0 and thrust to weight 2.0', () => {
    expect(engineStats(0)).toEqual({ speedMax: 6, accel: 1, thrustToWeight: 2 })
  })

  it('runs 6 x 1.05^e m/s with accel 1.05^e and thrust to weight 1 + 1.05^e, from 0 to 200', () => {
    const misses = PURCHASES_0_TO_200.filter((purchase) => {
      const growth = powInt(ENGINE_GROWTH, purchase)
      const engine = engineStats(purchase)
      return !(
        isWithinMillionth(engine.speedMax, mul(m('6'), growth)) &&
        isWithinMillionth(engine.accel, growth) &&
        isWithinMillionth(engine.thrustToWeight, add(m('1'), growth))
      )
    })
    expect(misses).toEqual([])
  })

  it('scales top speed, accel and net lift together, so the ramp keeps its length', () => {
    for (const purchase of [1, 20, 100, 200]) {
      const engine = engineStats(purchase)
      const start = engineStats(0)
      const speedGain = engine.speedMax / start.speedMax
      expect(engine.accel / start.accel).toBeCloseTo(speedGain, 6)
      expect((engine.thrustToWeight - 1) / (start.thrustToWeight - 1)).toBeCloseTo(speedGain, 6)
    }
  })

  it('prices its first purchase at 4, as the old first engine step did', () => {
    expect(stepPrice('engine', 0, 1)).toEqual(m('4'))
  })

  it.each(PACE_PLANETS)(
    'prices purchase e at ceil(3.6 x 1.60^e) x paceScale for e = 0 to 200 on planet %i',
    (planetIndex) => {
      const misses = PURCHASES_0_TO_200.filter((purchase) => {
        const law = mul(enginePriceRowOf(purchase), paceScale(planetIndex))
        return cmp(stepPrice('engine', purchase, planetIndex), law) !== 0
      })
      expect(misses).toEqual([])
    },
  )

  it('raises every price from purchase 0 to 200 by at least the top speed its purchase adds', () => {
    const cheap = PURCHASES_0_TO_200.filter((purchase) => {
      const priceRatio = div(stepPrice('engine', purchase + 1, 1), stepPrice('engine', purchase, 1))
      return cmp(priceRatio, ENGINE_GROWTH) < 0
    })
    expect(cheap).toEqual([])
  })
})

describe('no max level on the hold, the boiler or the engine (ticket 553)', () => {
  it('declares the three tracks per purchase, with no max level and no major split', () => {
    for (const upgradeId of ['cargo_hold', 'boiler', 'engine'] as const) {
      const upgrade = ECONOMY.upgrades.find((candidate) => candidate.id === upgradeId)
      expect(upgrade?.maxLevel).toBeNull()
      expect(isPerPurchaseTrack(upgradeId)).toBe(true)
      expect(upgradePrice(upgradeId, 37, 3)).toEqual(stepPrice(upgradeId, 37, 3))
    }
  })
})
