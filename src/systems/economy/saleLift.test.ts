import { describe, expect, it } from 'vitest'
import { toCanonical } from '../money'
import { assayBeaconLiftOf, assayedSalePrice } from './assayPricing'
import { oreSalePrice, oreTier } from './oreEconomy'
import {
  isLiftAbove,
  largestLift,
  liftedSalePrice,
  liftText,
  NO_LIFT,
  premiumLiftCap,
} from './saleLift'

const PLANETS = [1, 6, 1_000_000]

describe('sale lifts', () => {
  it('compares lifts exactly and keeps the largest, never their product', () => {
    const premium = { num: 5n, den: 4n }
    const beacon = { num: 3n, den: 2n }
    expect(isLiftAbove(beacon, premium)).toBe(true)
    expect(largestLift([premium, beacon])).toBe(beacon)
    expect(largestLift([])).toBe(NO_LIFT)
  })

  it('sells a unit with no lift at its plain floorMilli(V(t))', () => {
    for (const planet of PLANETS) {
      const tier = oreTier(planet, 1)
      expect(toCanonical(liftedSalePrice(tier, NO_LIFT))).toBe(toCanonical(oreSalePrice(tier)))
    }
  })

  it('caps the premium at 5/4', () => {
    expect(liftText(premiumLiftCap())).toBe('5/4')
  })

  it('reads the beacon as 9/4 on band 1, 3/2 on band 2 and nothing from band 3', () => {
    expect(liftText(assayBeaconLiftOf(6, oreTier(6, 1)) ?? NO_LIFT)).toBe('9/4')
    expect(liftText(assayBeaconLiftOf(6, oreTier(6, 2)) ?? NO_LIFT)).toBe('3/2')
    expect(assayBeaconLiftOf(6, oreTier(6, 3))).toBeNull()
    expect(assayBeaconLiftOf(6, oreTier(5, 1))).toBeNull()
  })

  it('prices a beacon-lifted unit at the mid-band unit price where V(t) is exact', () => {
    for (const planet of [1, 2, 6]) {
      for (const band of [1, 2]) {
        expect(toCanonical(assayedSalePrice(planet, oreTier(planet, band)))).toBe(
          toCanonical(oreSalePrice(oreTier(planet, 3))),
        )
      }
    }
  })

  it('lifts the bignum V(t) itself at g = 1e6, floored to its 40th digit', () => {
    const tier = oreTier(1_000_000, 1)
    expect(toCanonical(assayedSalePrice(1_000_000, tier))).toBe(
      toCanonical(liftedSalePrice(tier, { num: 9n, den: 4n })),
    )
    expect(toCanonical(liftedSalePrice(tier, NO_LIFT))).toBe(toCanonical(oreSalePrice(tier)))
  })
})
