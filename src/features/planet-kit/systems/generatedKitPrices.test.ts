import { describe, expect, it } from 'vitest'
import { runValueOf } from '../../../systems/economy/jumpFuel'
import { paceScale } from '../../../systems/economy/planetEconomy'
import { cmp, fromSafeInteger, mul, type Money } from '../../../systems/money'
import { campaignIndex, planetIndexOfCampaign } from '../../../systems/starMap/campaignIndex'
import { planetsPerSystem } from '../../solar-systems'
import { NO_KIT_HOLDINGS, spendConsumable, withConsumableBought } from './kitHoldings'
import { merchantPremiumLiftOf } from './merchantPremium'
import { kitItemPriceAt, kitPriceAtIndex, planetIndexOfKitPlanet } from './planetKitPrices'
import { PLANET_KITS } from './planetKitRows'
import { kitItemsOfKind, stockedItemsOf } from './planetKitSales'

/** g = planetsBefore(s) + p for every planet of s = 2, 3, 40 and 1e6 (VS row 1 on #824). */
const DRAWN_SYSTEMS = [2n, 3n, 40n, 1_000_000n]

function drawnPlanets() {
  return DRAWN_SYSTEMS.flatMap((system) =>
    Array.from({ length: planetsPerSystem() }, (_, at) => ({
      system: system.toString(),
      planet: String(at + 1),
    })),
  )
}

function planetIndexOf(planet: { system: string; planet: string }): number {
  return planetIndexOfCampaign(campaignIndex(BigInt(planet.system), BigInt(planet.planet)))
}

/** R(g) · paceScale(g): the unit of the VS band. */
function bandUnitAt(planetIndex: number): Money {
  return mul(runValueOf(planetIndex), paceScale(planetIndex))
}

function isInBand(price: Money, planetIndex: number): boolean {
  const unit = bandUnitAt(planetIndex)
  return cmp(price, unit) >= 0 && cmp(price, mul(unit, fromSafeInteger(3))) <= 0
}

describe('kit prices on generated planets (ticket 824)', () => {
  it('prices the tool rule within [1, 3]·R(g)·paceScale(g) at every drawn planet’s g', () => {
    const toolRule = kitItemsOfKind(PLANET_KITS, 'tool')[0].price
    for (const g of drawnPlanets().map(planetIndexOf)) {
      expect(isInBand(kitPriceAtIndex(toolRule, g), g)).toBe(true)
    }
  })

  it('asks for each tool a generated merchant stocks its home-g price, inside the band there', () => {
    for (const planet of drawnPlanets()) {
      for (const item of stockedItemsOf(PLANET_KITS.items, planet)) {
        const home = planetIndexOfKitPlanet(item.homePlanet)
        expect(kitItemPriceAt(item, planet)).toEqual(kitPriceAtIndex(item.price, home))
        expect(isInBand(kitItemPriceAt(item, planet), home)).toBe(true)
      }
    }
  })

  it('never lowers a kit price from g to g + 1', () => {
    for (const item of PLANET_KITS.items) {
      for (const g of drawnPlanets().map(planetIndexOf)) {
        expect(
          cmp(kitPriceAtIndex(item.price, g), kitPriceAtIndex(item.price, g + 1)),
        ).toBeLessThanOrEqual(0)
      }
    }
  })

  it('pays a premium of at most +25%, one ratio that reads no planet and so no system', () => {
    const lift = merchantPremiumLiftOf(PLANET_KITS)
    expect(lift.num * 4n).toBeLessThanOrEqual(lift.den * 5n)
    expect(lift).toEqual({ num: 5n, den: 4n })
  })

  it('pins a consumable bought at s = 1e6 to the g it was bought at', () => {
    const g = campaignIndex(1_000_000n, 5n)
    const held = withConsumableBought(NO_KIT_HOLDINGS, 'cache_crate', g)
    expect(spendConsumable(held, 'cache_crate')?.boughtAt).toBe(g)
  })
})
