import { describe, expect, it } from 'vitest'
import { toCanonical } from '../money'
import { assayedSalePrice, isAssayLifted } from './assayPricing'
import { oreSalePrice } from './oreEconomy'

const priceText = (planetIndex: number, tier: number) =>
  toCanonical(assayedSalePrice(planetIndex, tier))

describe('assay beacon pricing (#46, #64 acceptance 3)', () => {
  it('sells planet 1 bands 1 and 2 at the band-3 unit price floorMilli(V(3))', () => {
    expect(priceText(1, 1)).toBe(toCanonical(oreSalePrice(3)))
    expect(priceText(1, 2)).toBe(toCanonical(oreSalePrice(3)))
    expect(priceText(1, 1)).toBe('2.25e+1')
  })

  it('leaves band 3 and deeper at their own price', () => {
    for (const tier of [3, 4, 5]) expect(priceText(1, tier)).toBe(toCanonical(oreSalePrice(tier)))
  })

  it('lifts planet 2 bands 1 and 2 (tiers 4 and 5) to tier 6, floored to 0.001', () => {
    expect(priceText(2, 4)).toBe('7.5937e+1')
    expect(priceText(2, 5)).toBe('7.5937e+1')
    expect(priceText(2, 6)).toBe(toCanonical(oreSalePrice(6)))
  })

  it('never lifts ore of another planet', () => {
    expect(isAssayLifted(2, 3)).toBe(false)
    expect(priceText(2, 3)).toBe(toCanonical(oreSalePrice(3)))
  })
})
