import { describe, expect, it } from 'vitest'
import { ceil, fromCanonical, mul, powInt } from '../money'
import { UPGRADE_IDS } from './economyDefinition'
import { upgradePrice } from './upgradePrices'

const m = fromCanonical

describe('upgrade prices', () => {
  it('prices level 0 at 24, 24, 36, 48, 48 and 72 for cargo, boiler, engine, hull, drill, tip', () => {
    const order = ['cargo_hold', 'boiler', 'engine', 'hull', 'drill_power', 'drill_tip'] as const
    expect(order.map((upgradeId) => upgradePrice(upgradeId, 0, 1))).toEqual(
      ['24', '24', '36', '48', '48', '72'].map(m),
    )
  })

  it('prices level 1 at ceil(base * ratio): 30 for the cargo hold and 111 for the tip', () => {
    expect(upgradePrice('cargo_hold', 1, 1)).toEqual(m('30'))
    expect(upgradePrice('drill_tip', 1, 1)).toEqual(m('111'))
  })

  it('grows the tip price by "1.5376" per level and every other track by "1.24"', () => {
    expect(upgradePrice('drill_tip', 20, 1)).toEqual(ceil(mul(m('72'), powInt(m('1.5376'), 20))))
    expect(upgradePrice('hull', 20, 1)).toEqual(ceil(mul(m('48'), powInt(m('1.24'), 20))))
    expect(upgradePrice('engine', 20, 1)).toEqual(ceil(mul(m('36'), powInt(m('1.24'), 20))))
  })

  it('is a whole number at every level', () => {
    for (const upgradeId of UPGRADE_IDS) {
      for (const level of [0, 1, 7, 40, 1000]) {
        const price = upgradePrice(upgradeId, level, 1)
        expect(ceil(price)).toEqual(price)
      }
    }
  })

  it('refuses a negative or fractional level', () => {
    expect(() => upgradePrice('hull', -1, 1)).toThrow(RangeError)
    expect(() => upgradePrice('hull', 1.5, 1)).toThrow(RangeError)
  })
})
