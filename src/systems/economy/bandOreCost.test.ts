import { describe, expect, it } from 'vitest'
import { ceilMilli, cmp, mul, toCanonical } from '../money'
import { bandOrePrice, bandOrePriceAt, bandOreWorth, bandOreWorthAt } from './bandOreCost'
import { chargeOreUnits, chargeSizeCount, chargeSizesUpTo } from './chargeSizes'
import { ECONOMY } from './economy'
import type { BandOreCost } from './economyDefinition'
import { oreTier, oreValue } from './oreEconomy'
import { paceScale } from './planetEconomy'

// Every band-ore cost economy.json prices today: the gun mount and levels, each charge size, and
// each hazard act's lining unlock.
const FIXTURE_COSTS: readonly BandOreCost[] = [
  ECONOMY.gun.mountCost,
  ECONOMY.gun.levelCost,
  ...chargeSizesUpTo(chargeSizeCount()).map((size) => ({
    band: ECONOMY.blastingCharges.sizes.oreUnitsBand,
    oreUnits: chargeOreUnits(size),
  })),
  ...ECONOMY.archetypes.map((archetype) => archetype.liningUnlockCost),
]

const PLANETS = [...Array.from({ length: 60 }, (_, index) => index + 1), 247, 607, 6007]

/** The deep planets the Vertical Scaler pins (#165): far past any `paceScale` step. */
const DEEP_PLANETS = [247, 607, 6007] as const

/** P5 sits in the `paceScale` 1.4 step (#6 section 6), so a later planet's pace differs. */
const PACE_STEP_PLANET = 5

describe('band ore cost at a pinned pace planet', () => {
  it('prices every fixture exactly like bandOrePrice when both planets match', () => {
    for (const cost of FIXTURE_COSTS) {
      for (const planet of PLANETS) {
        expect(bandOrePriceAt(cost, planet, planet)).toEqual(bandOrePrice(cost, planet))
        expect(bandOreWorthAt(cost, planet, planet)).toEqual(bandOreWorth(cost, planet))
      }
    }
  })

  it("takes the ore's worth from the worth planet and paceScale from the pace planet", () => {
    const cost = ECONOMY.gun.mountCost
    const worth = mul(cost.oreUnits, oreValue(oreTier(247, cost.band)))
    expect(bandOrePriceAt(cost, 247, PACE_STEP_PLANET)).toEqual(
      ceilMilli(mul(worth, paceScale(PACE_STEP_PLANET))),
    )
  })

  it('climbs strictly with the worth planet while the pace planet stays pinned', () => {
    for (const cost of FIXTURE_COSTS) {
      const worthPlanets = [PACE_STEP_PLANET, 6, 7, 8, 9, 20, ...DEEP_PLANETS]
      const prices = worthPlanets.map((planet) => bandOrePriceAt(cost, planet, PACE_STEP_PLANET))
      prices.slice(1).forEach((price, index) => expect(cmp(price, prices[index])).toBe(1))
    }
  })

  it('never makes a P5 unlock cheaper by buying it on P8, where paceScale drops to 1', () => {
    const cost = ECONOMY.gun.mountCost
    const pinned = bandOrePriceAt(cost, 8, PACE_STEP_PLANET)
    expect(cmp(pinned, bandOrePrice(cost, 8))).toBe(1)
  })

  it('pins the gun mount price at L 247, 607 and 6007', () => {
    const prices = DEEP_PLANETS.map((planet) =>
      toCanonical(bandOrePriceAt(ECONOMY.gun.mountCost, planet, planet)),
    )
    expect(prices).toEqual([
      '1.370362526483539420483320170473450304651e+133',
      '2.06726072706004261259514069164802427705e+323',
      '9.858071328965119658211500271931413590364e+3175',
    ])
  })
})
