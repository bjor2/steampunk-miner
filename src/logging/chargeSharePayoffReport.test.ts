import { describe, expect, it } from 'vitest'
import { minChargeFor } from '../systems/economy/chargeSizes'
import { oreTier } from '../systems/economy/oreEconomy'
import { chargeSharePayoffsOnPlanet, type GatedMixBands } from '../systems/bot/chargeSharePayoff'
import { chargeSharePayoffTable, lowBandsWithDynamiteCells } from './chargeSharePayoffReport'

/** Planet `p` with a dynamite-gated +1 in band 4 and a +1 and a +2 in band 5. */
function fixturePlanet(planetIndex: number): GatedMixBands {
  return [1, 2, 3, 4, 5].map((band) => {
    const tier = oreTier(planetIndex, band)
    const gateOf = (lead: number, isGated: boolean) =>
      isGated ? minChargeFor({ lead, band }, planetIndex) : null
    return [
      { tier, weightBp: 8800, signature: false, minCharge: null },
      { tier: tier + 1, weightBp: 800, signature: false, minCharge: gateOf(1, band >= 4) },
      { tier: tier + 2, weightBp: 400, signature: false, minCharge: gateOf(2, band === 5) },
    ]
  })
}

describe('charge payoff share table (ticket 247)', () => {
  it('prints planet, band, size, cells, value, price, payoff and the cap per row', () => {
    const rows = [7, 22].flatMap((planet) =>
      chargeSharePayoffsOnPlanet(planet, fixturePlanet(planet)),
    )
    expect(chargeSharePayoffTable(rows)).toMatchSnapshot()
  })

  it('says so when no band holds dynamite-gated cells', () => {
    expect(chargeSharePayoffTable([])).toBe('no band holds dynamite-gated lead cells')
  })

  it('names the bands 1 to 3 that hold dynamite-gated cells once each', () => {
    const lowBand = fixturePlanet(9).map((entries, at) =>
      at === 1 ? entries.map((entry) => ({ ...entry, minCharge: entry.minCharge ?? 1 })) : entries,
    )
    const rows = chargeSharePayoffsOnPlanet(9, lowBand)
    expect(lowBandsWithDynamiteCells(rows)).toBe('planet 9 band 2')
    expect(lowBandsWithDynamiteCells(chargeSharePayoffsOnPlanet(9, fixturePlanet(9)))).toBe('none')
  })
})
