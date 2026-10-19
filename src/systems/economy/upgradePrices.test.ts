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
  // #84: the tip base sits above the c0 * weight start (72), so the flattened ratio costs the slice
  // what the old curve did. #195: the hull base is the x0.8 land of the re-fit. Drill power is
  // priced per purchase since #552 (drillPowerRows.test.ts), the hold, the boiler and the engine
  // since ticket 553 (perPurchaseRows.test.ts): their first purchases cost 3, 3, 4 and 1.
  it('prices level 0 at 3, 3, 4, 46, 1 and 83 for cargo, boiler, engine, hull, drill, tip', () => {
    const order = ['cargo_hold', 'boiler', 'engine', 'hull', 'drill_power', 'drill_tip'] as const
    expect(order.map((upgradeId) => upgradePrice(upgradeId, 0, 1))).toEqual(
      ['3', '3', '4', '46', '1', '83'].map(m),
    )
  })

  it('prices level 1 at ceil(base * ratio): 3 for the cargo hold and 125 for the tip', () => {
    expect(upgradePrice('cargo_hold', 1, 1)).toEqual(m('3'))
    expect(upgradePrice('drill_tip', 1, 1)).toEqual(m('125'))
  })

  it('grows the hull by "1.225", the tip by "1.500625" and the engine by "1.60" per level', () => {
    expect(upgradePrice('drill_tip', 20, 1)).toEqual(ceil(mul(m('83'), powInt(m('1.500625'), 20))))
    expect(upgradePrice('hull', 20, 1)).toEqual(ceil(mul(m('46'), powInt(m('1.225'), 20))))
    expect(upgradePrice('engine', 20, 1)).toEqual(ceil(mul(m('3.6'), powInt(m('1.60'), 20))))
  })

  // #195: the brass tracks and casing share one ratio, so six levels a planet grow r^6 = 1.5^3,
  // the same as ore. Drill power left that ratio for Systems' rows on ticket 396, then for its
  // per-purchase rows on #551 (ticket 552); the hold, the boiler and the engine for theirs on #553.
  it('stores one ratio on the hull and the casing grades', () => {
    const brassCurveIds = ['cost.vehicle.hull', 'cost.casing.upgrade']
    const brassRatio = ratioOfCurve('cost.vehicle.hull')
    expect(brassCurveIds.map(ratioOfCurve)).toEqual(brassCurveIds.map(() => brassRatio))
  })

  // #77: the brass ratio r is 3.375^(1/6) to the milli, so r^6 = 1.5^3 and six levels a planet
  // cost what three ore tiers pay. The tip buys three levels a planet, so its ratio is r^2.
  it('stores the brass ratio as the sixth root of 1.5^3 rounded to the milli', () => {
    const brassRatio = ratioOfCurve('cost.vehicle.hull')
    expect(floorMilli(brassRatio)).toEqual(brassRatio)
    expect(cmp(powInt(m('1.2245'), 6), ORE_GROWTH_PER_PLANET)).toBe(-1)
    expect(cmp(powInt(m('1.2255'), 6), ORE_GROWTH_PER_PLANET)).toBe(1)
    expect(brassRatio).toEqual(m('1.225'))
  })

  it('prices the tip at the brass ratio squared, so both grow by r^6 a planet', () => {
    const brassRatio = ratioOfCurve('cost.vehicle.hull')
    const tipRatio = ratioOfCurve('cost.vehicle.drill_tip')
    expect(tipRatio).toEqual(powInt(brassRatio, 2))
    expect(powInt(tipRatio, 3)).toEqual(powInt(brassRatio, 6))
  })

  it('is a whole number at every level on planet 1', () => {
    for (const upgradeId of UPGRADE_IDS) {
      for (const level of [0, 1, 7, 40, 1000]) {
        const price = upgradePrice(upgradeId, level, 1)
        expect(ceil(price)).toEqual(price)
      }
    }
  })

  // Ticket 553 (Systems' rows on #553): the 0.75 row and the planet 11 reset are gone, so planet 8
  // on, endless included, keeps 1.7.
  it('prices planets 10, 11 and 40 at 1.7 times the bare curve, rounded up', () => {
    const worth = mul(m('83'), powInt(m('1.500625'), 37))
    for (const planetIndex of [10, 11, 40]) {
      expect(upgradePrice('drill_tip', 37, planetIndex)).toEqual(ceil(mul(m('1.7'), worth)))
    }
  })

  it('refuses a negative or fractional level', () => {
    expect(() => upgradePrice('hull', -1, 1)).toThrow(RangeError)
    expect(() => upgradePrice('hull', 1.5, 1)).toThrow(RangeError)
  })
})
