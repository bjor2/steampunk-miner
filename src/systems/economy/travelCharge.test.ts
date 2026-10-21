import { describe, expect, it } from 'vitest'
import { add, cmp, fromCanonical, sub, ZERO_MONEY } from '../money'
import { planetPriceRow } from './economyTables'
import { travelFee } from './planetCharges'
import { isTravelFeeClamped, nextOnCurvePriceOf, travelChargeOf } from './travelCharge'

const m = fromCanonical
const ROW_1 = planetPriceRow(1)
const NEXT_1 = nextOnCurvePriceOf(ROW_1)

describe('travel charge', () => {
  it('reads the fee from the planet price row, the travel fee formula', () => {
    expect(ROW_1.travelFee).toEqual(travelFee(1))
    expect(planetPriceRow(5).travelFee).toEqual(travelFee(5))
  })

  it('takes the cheaper of the next on-curve drill and tip as the next price', () => {
    expect(NEXT_1).toEqual(m('1423'))
    expect(nextOnCurvePriceOf({ ...ROW_1, drillTipNext: m('2000') })).toEqual(m('1493'))
  })

  it('charges the full row fee when the money covers the fee and the next price', () => {
    const money = m('1e6')
    expect(travelChargeOf(ROW_1, money)).toEqual(ROW_1.travelFee)
    expect(isTravelFeeClamped(ROW_1, money)).toBe(false)
  })

  it('charges only what lies above the next on-curve price when money is short of both', () => {
    const money = add(NEXT_1, m('10.5'))
    expect(travelChargeOf(ROW_1, money)).toEqual(m('10.5'))
    expect(isTravelFeeClamped(ROW_1, money)).toBe(true)
  })

  it('travels free below the next on-curve price and with zero money', () => {
    expect(travelChargeOf(ROW_1, sub(NEXT_1, m('0.001')))).toEqual(ZERO_MONEY)
    expect(travelChargeOf(ROW_1, ZERO_MONEY)).toEqual(ZERO_MONEY)
  })

  it('always leaves the next on-curve price in the wallet when the wallet held it', () => {
    for (let planet = 1; planet <= 12; planet++) {
      const row = planetPriceRow(planet)
      const next = nextOnCurvePriceOf(row)
      for (const extra of ['0', '1', '1e3', '1e9']) {
        const money = add(next, m(extra))
        expect(cmp(sub(money, travelChargeOf(row, money)), next)).toBeGreaterThanOrEqual(0)
      }
    }
  })

  it('never charges more than the money held, nor below zero', () => {
    for (const text of ['0', '0.001', '60', '1422.999', '1483.75', '1e40']) {
      const charge = travelChargeOf(ROW_1, m(text))
      expect(cmp(charge, ZERO_MONEY)).toBeGreaterThanOrEqual(0)
      expect(cmp(charge, m(text))).toBeLessThanOrEqual(0)
    }
  })
})
