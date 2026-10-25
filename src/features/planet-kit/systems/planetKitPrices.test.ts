import { describe, expect, it } from 'vitest'
import { formatPrice } from '../../../systems/displayAmount'
import { toCanonical, type Money } from '../../../systems/money'
import { campaignIndex, planetIndexOfCampaign } from '../../../systems/starMap/campaignIndex'
import { kitItemPriceAt, kitPriceAtIndex, planetIndexOfKitPlanet } from './planetKitPrices'
import { PLANET_KITS } from './planetKitRows'
import { kitItemOf } from './planetKitSales'
import type { KitPriceRule } from './planetKitTypes'

const at = (system: string, planet: string) => ({ system, planet })
/** g = 1, 2, 5, 6, 10 and 1e6 (VS row 0), then s = 2, 10 and 1e6 at p = 1. */
const GOLDEN_G = [1, 2, 5, 6, 10, 1_000_000]
const GOLDEN_SYSTEMS = [2n, 10n, 1_000_000n]

function ruleOf(itemId: string): KitPriceRule {
  return kitItemOf(PLANET_KITS, itemId)!.price
}

/** `g amount readout` of a price. */
function priceLineOf(g: number, price: Money): string {
  return `${g} ${toCanonical(price)} ${formatPrice(price)}`
}

function firstPlanetIndexOfSystem(system: bigint): number {
  return planetIndexOfCampaign(campaignIndex(system, 1n))
}

describe('planet kit prices (ticket 821)', () => {
  it('prices a tool at R(g) times paceScale(g), rounded up, with its #681 readout', () => {
    const tool = ruleOf('scree_plough')
    expect(GOLDEN_G.map((g) => priceLineOf(g, kitPriceAtIndex(tool, g)))).toEqual([
      '1 5.0625e+2 507',
      '2 2.050313e+3 2,051',
      '5 9.4585081e+4 94.6k',
      '6 3.54694052e+5 355k',
      '10 4.8896520105e+7 48.9M',
      '1000000 1.526536609929486684001373064825875713353e+528276 2e528276',
    ])
  })

  it('prices the Cache Crate at a tenth of R(g) with no pace factor', () => {
    const crate = ruleOf('cache_crate')
    expect(GOLDEN_G.map((g) => priceLineOf(g, kitPriceAtIndex(crate, g)))).toEqual([
      '1 5.0625e+1 50.7',
      '2 1.7086e+2 171',
      '5 6.568409e+3 6,569',
      '6 2.2168379e+4 22.2k',
      '10 2.876265889e+6 2.88M',
      '1000000 8.979627117232274611772782734269857137372e+528274 9e528274',
    ])
  })

  it('prices the Damp Flask at a fifth of R(g) with no pace factor', () => {
    const flask = ruleOf('damp_flask')
    expect(GOLDEN_G.map((g) => priceLineOf(g, kitPriceAtIndex(flask, g)))).toEqual([
      '1 1.0125e+2 102',
      '2 3.41719e+2 342',
      '5 1.3136817e+4 13.2k',
      '6 4.4336757e+4 44.4k',
      '10 5.752531777e+6 5.76M',
      '1000000 1.795925423446454922354556546853971427474e+528275 2e528275',
    ])
  })

  it('keys every price on global g, so p = 1 of systems 2, 10 and 1e6 reads g 6, 46 and 4999996', () => {
    const tool = ruleOf('vent_vane')
    expect(
      GOLDEN_SYSTEMS.map((system) => {
        const g = firstPlanetIndexOfSystem(system)
        return priceLineOf(g, kitPriceAtIndex(tool, g))
      }),
    ).toEqual([
      '6 3.54694052e+5 355k',
      '46 5.09487965530617460290132224448e+26 510Sp',
      '4999996 1.511055063120322609367670415652090095675e+2641369 2e2641369',
    ])
    expect(planetIndexOfKitPlanet(at('1000000', '1'))).toBe(4_999_996)
  })

  it('asks the same home-g price for a tool at every merchant, with no away markup', () => {
    const plough = kitItemOf(PLANET_KITS, 'scree_plough')!
    const home = kitItemPriceAt(plough, at('1', '2'))
    for (const buyer of [at('1', '3'), at('1', '5'), at('2', '1'), at('1000000', '1')]) {
      expect(toCanonical(kitItemPriceAt(plough, buyer))).toBe(toCanonical(home))
    }
    expect(toCanonical(home)).toBe('2.050313e+3')
  })

  it('prices a consumable at the g of the planet it is bought on', () => {
    const flask = kitItemOf(PLANET_KITS, 'damp_flask')!
    expect(toCanonical(kitItemPriceAt(flask, at('1', '3')))).toBe(
      toCanonical(kitPriceAtIndex(flask.price, 3)),
    )
    expect(formatPrice(kitItemPriceAt(flask, at('1', '3')))).toBe('1,154')
  })
})
