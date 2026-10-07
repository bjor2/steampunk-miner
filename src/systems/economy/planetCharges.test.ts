import { describe, expect, it } from 'vitest'
import { fromCanonical, ZERO_MONEY } from '../money'
import {
  energyUnitPrice,
  rechargePrice,
  repairPrice,
  rescueFee,
  rescueFeeBounds,
  travelFee,
} from './planetCharges'
import { coreFragmentsNeeded, paceScale } from './planetEconomy'
import { energyMax, hullMax } from './vehicleStats'

const m = fromCanonical

describe('planet charges', () => {
  it('charges 0.045 per energy unit on planet 1, so a full 150-unit tank costs 6.75', () => {
    expect(energyUnitPrice(1)).toEqual(m('0.045'))
    expect(rechargePrice(1, m(String(energyMax(0))))).toEqual(m('6.75'))
  })

  it('rounds a recharge up to the next 0.001', () => {
    expect(rechargePrice(1, m('0.01'))).toEqual(m('0.001'))
  })

  it('charges 11.25 for a full repair on planet 1 and a share of that for a partial one', () => {
    expect(repairPrice(1, hullMax(0), hullMax(0))).toEqual(m('11.25'))
    expect(repairPrice(1, m('25'), m('100'))).toEqual(m('2.813'))
  })

  it('bounds the planet 1 rescue fee between 67.5 and 675', () => {
    expect(rescueFeeBounds(1)).toEqual({ floor: m('67.5'), cap: m('675') })
  })

  it.each([
    ['0', '0'],
    ['50', '50'],
    ['100', '67.5'],
    ['2000', '100'],
    ['100000', '675'],
  ])('takes a rescue fee of %s -> %s on planet 1, never more than the money held', (money, fee) => {
    expect(rescueFee(1, m(money))).toEqual(m(fee))
  })

  it('charges a travel fee of 60.75 on planet 1 (60.8 in the table)', () => {
    expect(travelFee(1)).toEqual(m('60.75'))
  })

  it('needs 63 core fragments on planet 1 and 127 from planet 2 on', () => {
    expect(coreFragmentsNeeded(156)).toBe(63)
    expect(coreFragmentsNeeded(316)).toBe(127)
  })

  it('keeps planets 1 and 2 at the default pace of 1', () => {
    expect(paceScale(1)).toEqual(m('1'))
    expect(paceScale(2)).toEqual(m('1'))
  })

  it('scales planets 3 to 7 by the refinery row of 1.4 (#131)', () => {
    expect([3, 5, 7].map(paceScale)).toEqual([m('1.4'), m('1.4'), m('1.4')])
  })

  it('scales planets 8 to 10 by the campaign pace row of 0.75 (#137)', () => {
    expect([8, 9, 10].map(paceScale)).toEqual([m('0.75'), m('0.75'), m('0.75')])
  })

  it('ends the 0.75 row at planet 10, so planet 11 on, endless included, keeps pace 1 (#137)', () => {
    expect([11, 40, 1_000_000].map(paceScale)).toEqual([m('1'), m('1'), m('1')])
  })

  it('takes no fee from a player with no money', () => {
    expect(rescueFee(40, ZERO_MONEY)).toEqual(ZERO_MONEY)
  })
})
