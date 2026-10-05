import { describe, expect, it } from 'vitest'
import { add, toCanonical, ZERO_MONEY } from '../money'
import { casingGradeStart, casingUpgradePrice } from './casingPrices'

describe('casing prices', () => {
  it('starts every vehicle at grade 1', () => {
    expect(casingGradeStart()).toBe(1)
  })

  it('prices grades 1->2 .. 4->5 at 48, 60, 74 and 92, 274 together', () => {
    const prices = [1, 2, 3, 4].map(casingUpgradePrice)
    expect(prices.map(toCanonical)).toEqual(['4.8e+1', '6e+1', '7.4e+1', '9.2e+1'])
    expect(toCanonical(prices.reduce(add, ZERO_MONEY))).toBe('2.74e+2')
  })
})
