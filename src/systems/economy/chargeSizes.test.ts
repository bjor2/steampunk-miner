import { describe, expect, it } from 'vitest'
import { ceilMilli, cmp, fromCanonical, mul, toCanonical, type BigStat } from '../money'
import { bandOrePriceAt, bandOreWorthAt } from './bandOreCost'
import {
  chargeCostOf,
  chargePrice,
  chargeRadiusMm,
  chargeSizeCount,
  chargeSpec,
  fuseTicksOf,
  isInChargeRadius,
  isInLethalCore,
  hasLethalCore,
  isSizeLockedOn,
  keptFractionOf,
  largestSizeOn,
  minChargeFor,
  rackSlotsOf,
  remoteDisarmTicks,
  selfHitScaleOf,
  sizeUnlockPlanet,
} from './chargeSizes'
import { readEconomy } from './readEconomy'
import economyFile from './economy.json'
import { oreTier, oreValue } from './oreEconomy'
import { paceScale } from './planetEconomy'

const SIZES = Array.from({ length: 10 }, (_, at) => at + 1)

function textOf(amount: BigStat): string {
  return toCanonical(amount)
}

function decimal(text: string): string {
  return toCanonical(fromCanonical(text))
}

/** `units` band-5 ore units on planet `p`, rounded up to the milli like every price. */
function band5Units(units: string, planetIndex: number) {
  const unit = mul(oreValue(oreTier(planetIndex, 5)), paceScale(planetIndex))
  return ceilMilli(mul(fromCanonical(units), unit))
}

function economyWithSizes(sizes: Record<string, unknown>) {
  const charges = economyFile.blastingCharges
  return { ...economyFile, blastingCharges: { ...charges, sizes: { ...charges.sizes, ...sizes } } }
}

describe('charge size ladder', () => {
  it('has ten sizes on the one radius ladder 2.5, 3.5, 4.5, 6, 8, 10, 13, 16, 20 and 24 tiles', () => {
    expect(chargeSizeCount()).toBe(10)
    expect(SIZES.map(chargeRadiusMm)).toEqual([
      2500, 3500, 4500, 6000, 8000, 10000, 13000, 16000, 20000, 24000,
    ])
  })

  it('opens size n on planet 7 + 3(n - 1), size 10 on planet 34', () => {
    expect(SIZES.map(sizeUnlockPlanet)).toEqual([7, 10, 13, 16, 19, 22, 25, 28, 31, 34])
  })

  it('names the largest open size of a planet, none before planet 7 and 10 from planet 34 on', () => {
    expect([6, 7, 9, 10, 22, 33, 34, 40, 500].map(largestSizeOn)).toEqual([
      0, 1, 1, 2, 6, 9, 10, 10, 10,
    ])
  })

  it('keeps a size closed before its planet, and never size 1, the shipped charge', () => {
    expect(isSizeLockedOn(2, 9)).toBe(true)
    expect(isSizeLockedOn(2, 10)).toBe(false)
    expect(isSizeLockedOn(10, 33)).toBe(true)
    expect(isSizeLockedOn(1, 1)).toBe(false)
  })

  it('takes 1, 1, 1, 2, 2, 3, 4, 5, 6 and 8 rack slots, so a size 10 fills a full rack', () => {
    expect(SIZES.map(rackSlotsOf)).toEqual([1, 1, 1, 2, 2, 3, 4, 5, 6, 8])
  })

  it('fuses sizes 1 to 6 at 120, 120, 120, 150, 180 and 210 ticks and leaves 7 to 10 to the plunger', () => {
    expect(SIZES.map(fuseTicksOf)).toEqual([120, 120, 120, 150, 180, 210, null, null, null, null])
    expect(remoteDisarmTicks()).toBe(3600)
  })

  it('keeps 0.4 * 0.8^(n - 1) of the ordinary ore a blast breaks', () => {
    expect(textOf(keptFractionOf(1))).toBe(decimal('0.4'))
    expect(textOf(keptFractionOf(2))).toBe(decimal('0.32'))
    expect(textOf(keptFractionOf(10))).toBe(decimal('0.0536870912'))
  })

  it('prices a charge of size n at 2 * 1.8^(n - 1) band-5 ore units of the planet it is bought on', () => {
    expect(textOf(chargePrice(1, 1, 7))).toBe(textOf(band5Units('2', 7)))
    expect(textOf(chargePrice(4, 1, 16))).toBe(textOf(band5Units('11.664', 16)))
    expect(textOf(chargePrice(10, 1, 34))).toBe(textOf(band5Units('396.718580736', 34)))
  })

  it('charges every size on planets 7 to 40 through bandOrePriceAt, ceiled, never the raw worth', () => {
    for (const size of SIZES) {
      const { band, oreUnits } = chargeCostOf(size)
      for (let planet = 7; planet <= 40; planet++) {
        const units = mul(fromCanonical('3'), oreUnits)
        const expected = bandOrePriceAt({ band, oreUnits: units }, planet, planet)
        expect(textOf(chargePrice(size, 3, planet))).toBe(textOf(expected))
        expect(cmp(expected, bandOreWorthAt({ band, oreUnits: units }, planet, planet))).toBe(1)
      }
    }
  })

  it('rounds a buy of several charges once, as the ceiled bandOre price of all their ore units', () => {
    expect(textOf(chargePrice(2, 3, 10))).toBe(textOf(band5Units('10.8', 10)))
  })

  it('grows the self hit with the radius, 1 at size 1 and 9.6 at size 10', () => {
    expect(textOf(selfHitScaleOf(1))).toBe(decimal('1'))
    expect(textOf(selfHitScaleOf(4))).toBe(decimal('2.4'))
    expect(textOf(selfHitScaleOf(10))).toBe(decimal('9.6'))
  })

  it('makes the inner half of the radius lethal from size 4 on', () => {
    expect(SIZES.map(hasLethalCore)).toEqual([
      false,
      false,
      false,
      true,
      true,
      true,
      true,
      true,
      true,
      true,
    ])
  })

  it('reaches a point on the radius and not a millimetre past it, the inner half at r / 2', () => {
    expect(isInChargeRadius(4, 6000, 0)).toBe(true)
    expect(isInChargeRadius(4, 0, -6001)).toBe(false)
    expect(isInLethalCore(4, 3000, 0)).toBe(true)
    expect(isInLethalCore(4, 3001, 0)).toBe(false)
  })

  it('reads one spec per size from the table, priced for one charge', () => {
    expect(chargeSpec(7, 25)).toEqual({
      size: 7,
      radiusMm: 13000,
      unlockPlanet: 25,
      price: chargePrice(7, 1, 25),
      keptFraction: keptFractionOf(7),
      rackSlots: 4,
      fuseTicks: null,
    })
  })

  it('refuses a size outside the ladder', () => {
    expect(() => chargeRadiusMm(0)).toThrow(RangeError)
    expect(() => rackSlotsOf(11)).toThrow(RangeError)
    expect(() => keptFractionOf(1.5)).toThrow(RangeError)
  })
})

describe('minCharge of a dynamite-gated cell', () => {
  it('asks size 1 of every gated cell on planet 7', () => {
    expect(minChargeFor({ lead: 1, band: 5 }, 7)).toBe(1)
    expect(minChargeFor({ lead: 2, band: 5 }, 7)).toBe(1)
  })

  it('asks one size behind the newest of a +1 cell and the newest of a +2 cell', () => {
    expect(minChargeFor({ lead: 1, band: 5 }, 13)).toBe(2)
    expect(minChargeFor({ lead: 2, band: 5 }, 13)).toBe(3)
  })

  it('never asks more than the cell band, so sizes 6 to 10 are never a toll', () => {
    expect(minChargeFor({ lead: 2, band: 5 }, 40)).toBe(5)
    expect(minChargeFor({ lead: 2, band: 4 }, 40)).toBe(4)
    expect(minChargeFor({ lead: 1, band: 1 }, 40)).toBe(1)
  })
})

describe('charge size ladder data', () => {
  it('reads the committed ladder with no problems', () => {
    expect(readEconomy(economyFile).problems).toEqual([])
  })

  it('refuses per-size lists that do not hold one entry per radius', () => {
    const problems = readEconomy(economyWithSizes({ rackSlots: [1, 1] })).problems
    expect(problems).toContain('blastingCharges.sizes.rackSlots must hold one entry per radius')
  })

  it('refuses a radius ladder that does not grow with every size', () => {
    const problems = readEconomy(economyWithSizes({ radius: ['2.5', '2.5'] })).problems
    expect(problems).toContain('blastingCharges.sizes.radius must grow with every size')
  })

  it('refuses a size that would not fit a full rack', () => {
    const rackSlots = [1, 1, 1, 2, 2, 3, 4, 5, 6, 9]
    const problems = readEconomy(economyWithSizes({ rackSlots })).problems
    expect(problems).toContain('blastingCharges.sizes.rackSlots must fit 1 to rackMax')
  })

  it('keeps every fuse a whole number of ticks above zero', () => {
    const problems = readEconomy(economyWithSizes({ fuseTicks: [120, 0] })).problems
    expect(problems).toContain('blastingCharges.sizes.fuseTicks must be at least 1')
  })
})
