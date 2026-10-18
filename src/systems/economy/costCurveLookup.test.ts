import { describe, expect, it } from 'vitest'
import { ceil, fromCanonical, mul, powInt } from '../money'
import { geometricWorthAt, perPurchaseRowAt } from './costCurveLookup'
import type { GeometricCostCurve, PerPurchaseCostCurve } from './economyDefinition'

const m = fromCanonical

const PLAIN: GeometricCostCurve = {
  id: 'cost.test.plain',
  family: 'geometric',
  base: m('24'),
  ratio: m('1.225'),
}

/** The shape of drill power's rows on #551 (ticket 552), on numbers of its own. */
const PER_PURCHASE: PerPurchaseCostCurve = {
  id: 'cost.test.perPurchase',
  family: 'perPurchase',
  firstPrice: m('3'),
  base: m('7'),
  ratio: m('1.3'),
}

describe('geometric cost curves', () => {
  it('prices level L at base x ratio^L before rounding', () => {
    expect(geometricWorthAt(PLAIN, 7)).toEqual(mul(m('24'), powInt(m('1.225'), 7)))
  })
})

describe('per-purchase cost curves (ticket 552)', () => {
  it('prices purchase 0 at its first price', () => {
    expect(perPurchaseRowAt(PER_PURCHASE, 0)).toEqual(m('3'))
  })

  it('prices purchase n from 1 on at ceil(base x ratio^(n - 1))', () => {
    expect(perPurchaseRowAt(PER_PURCHASE, 1)).toEqual(m('7'))
    expect(perPurchaseRowAt(PER_PURCHASE, 2)).toEqual(m('10'))
    expect(perPurchaseRowAt(PER_PURCHASE, 9)).toEqual(ceil(mul(m('7'), powInt(m('1.3'), 8))))
  })
})
