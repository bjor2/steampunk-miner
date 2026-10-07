import { describe, expect, it } from 'vitest'
import { ceil, cmp, floorMilli, fromCanonical, mul, powInt, type Money } from '../money'
import { ECONOMY } from './economy'
import { UPGRADE_IDS } from './economyDefinition'
import { upgradePrice } from './upgradePrices'

const m = fromCanonical

/** Ore value grows by 1.5 per tier and three tiers per planet (#6). */
const ORE_GROWTH_PER_PLANET = m('3.375')

function ratioOfCurve(curveId: string): Money {
  const curve = ECONOMY.costCurves.find((candidate) => candidate.id === curveId)
  if (curve?.family !== 'geometric') throw new Error(`no geometric cost curve ${curveId}`)
  return curve.ratio
}

describe('upgrade prices', () => {
  // #84: the drill and tip bases sit above the c0 * weight start (48, 72), so the flattened ratio
  // costs the slice what the old curve did. #195: the brass bases are the x0.8 land of the re-fit.
  it('prices level 0 at 24, 23, 36, 46, 55 and 83 for cargo, boiler, engine, hull, drill, tip', () => {
    const order = ['cargo_hold', 'boiler', 'engine', 'hull', 'drill_power', 'drill_tip'] as const
    expect(order.map((upgradeId) => upgradePrice(upgradeId, 0, 1))).toEqual(
      ['24', '23', '36', '46', '55', '83'].map(m),
    )
  })

  it('prices level 1 at ceil(base * ratio): 30 for the cargo hold and 125 for the tip', () => {
    expect(upgradePrice('cargo_hold', 1, 1)).toEqual(m('30'))
    expect(upgradePrice('drill_tip', 1, 1)).toEqual(m('125'))
  })

  it('grows drill power and every brass track by "1.225" and the tip by "1.500625" per level', () => {
    expect(upgradePrice('drill_power', 20, 1)).toEqual(ceil(mul(m('55'), powInt(m('1.225'), 20))))
    expect(upgradePrice('drill_tip', 20, 1)).toEqual(ceil(mul(m('83'), powInt(m('1.500625'), 20))))
    expect(upgradePrice('hull', 20, 1)).toEqual(ceil(mul(m('46'), powInt(m('1.225'), 20))))
    expect(upgradePrice('engine', 20, 1)).toEqual(ceil(mul(m('36'), powInt(m('1.225'), 20))))
  })

  // #195: the brass tracks and casing share drill power's ratio, so six levels a planet grow
  // r^6 = 1.5^3, the same as ore.
  it('stores the drill ratio on the four brass tracks and the casing grades', () => {
    const brassCurveIds = [
      'cost.vehicle.cargo_hold',
      'cost.vehicle.boiler',
      'cost.vehicle.engine',
      'cost.vehicle.hull',
      'cost.casing.upgrade',
    ]
    const drillRatio = ratioOfCurve('cost.vehicle.drill_power')
    expect(brassCurveIds.map(ratioOfCurve)).toEqual(brassCurveIds.map(() => drillRatio))
  })

  // #77: the drill ratio r is 3.375^(1/6) to the milli, so r^6 = 1.5^3 and six drill levels a
  // planet cost what three ore tiers pay. The tip buys three levels a planet, so its ratio is r^2.
  it('stores the drill ratio as the sixth root of 1.5^3 rounded to the milli', () => {
    const drillRatio = ratioOfCurve('cost.vehicle.drill_power')
    expect(floorMilli(drillRatio)).toEqual(drillRatio)
    expect(cmp(powInt(m('1.2245'), 6), ORE_GROWTH_PER_PLANET)).toBe(-1)
    expect(cmp(powInt(m('1.2255'), 6), ORE_GROWTH_PER_PLANET)).toBe(1)
    expect(drillRatio).toEqual(m('1.225'))
  })

  it('prices the tip at the drill ratio squared, so both grow by r^6 a planet', () => {
    const drillRatio = ratioOfCurve('cost.vehicle.drill_power')
    const tipRatio = ratioOfCurve('cost.vehicle.drill_tip')
    expect(tipRatio).toEqual(powInt(drillRatio, 2))
    expect(powInt(tipRatio, 3)).toEqual(powInt(drillRatio, 6))
  })

  it('is a whole number at every level', () => {
    for (const upgradeId of UPGRADE_IDS) {
      for (const level of [0, 1, 7, 40, 1000]) {
        const price = upgradePrice(upgradeId, level, 1)
        expect(ceil(price)).toEqual(price)
      }
    }
  })

  // #137: the 0.75 campaign row ends at planet 10, so planet 11 on keeps the prices it had before.
  it('prices planet 11 on at the bare curve, as before the planet 8 to 10 pace row', () => {
    expect(upgradePrice('drill_power', 67, 11)).toEqual(m('4.4205941e+7'))
    expect(upgradePrice('drill_tip', 37, 11)).toEqual(m('2.76152295e+8'))
    expect(upgradePrice('cargo_hold', 200, 40)).toEqual(m('1.0172530058759338166e+19'))
  })

  it('prices planet 10 at three quarters of planet 11, rounded up', () => {
    expect(upgradePrice('drill_power', 67, 10)).toEqual(m('3.3154456e+7'))
  })

  it('refuses a negative or fractional level', () => {
    expect(() => upgradePrice('hull', -1, 1)).toThrow(RangeError)
    expect(() => upgradePrice('hull', 1.5, 1)).toThrow(RangeError)
  })
})
