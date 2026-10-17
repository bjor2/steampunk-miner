import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  percentOfBasisPoints,
  renderRarityShares,
  renderRaritySharesFailure,
} from './rarityShareHtml.mjs'

// The Rarity shares panel (ticket 449) from the committed docs/economy/rarity-shares.json and from
// small tables made here: every planet and band in a row, a bound missed in red, the #385 shares.

const COMMITTED = JSON.parse(readFileSync('docs/economy/rarity-shares.json', 'utf8'))

const BOUNDS = {
  perNonCommonKindMax: 1500,
  perNonCommonTierMax: 650,
  epicPlusMythicTripClampBp: 1500,
  perCommonKindMaxOfBandTrip: 5000,
  perCommonKindMaxOfPlanet: 4000,
  meanShiftMaxBp: 0.5,
  cvMaxBp: 300,
  p999MaxOfNominalBp: 11200,
  clampLossMaxBp: 1,
  liveCommonsPerBandMin: 2,
}

function bandOf(overrides = {}) {
  return {
    band: 5,
    tiersBp: { uncommon: 319, signature: 427 },
    epicAndMythicBp: 229,
    worstCommonKindBp: null,
    worstOtherKindBp: null,
    fewestLiveCommons: null,
    meanShiftBp: '0.06',
    cvBp: 281,
    p999OfExpectedBp: 11098,
    worstEpicAndMythicTripBp: 1350,
    clampLossBp: '0.91',
    ...overrides,
  }
}

function tableOf(band, violations = []) {
  return {
    schema: 1,
    ticket: 449,
    seeds: [83921],
    bounds: BOUNDS,
    planets: [
      {
        planet: 3,
        hold: 90,
        hasRoster: false,
        isSignatureBoosted: false,
        bands: [band],
        worstCommonKindOfPlanetBp: null,
        worstOtherKindOfPlanetBp: null,
        violations,
      },
    ],
    incomeCap: [
      {
        planet: 10,
        item: 'power.mineral_drain',
        shareBp: 1421,
        nominalShareBp: 1500,
        unclampedBp: 2314,
        isFailing: false,
      },
    ],
  }
}

describe('rarity shares panel', () => {
  it('draws a row for every judged planet and band of the committed table', () => {
    const html = renderRarityShares(COMMITTED)
    const rows = COMMITTED.planets.reduce((sum, planet) => sum + planet.bands.length, 0)
    expect(html.match(/<tr><td>P\d+<\/td><td>\d<\/td>/g)).toHaveLength(rows)
    expect(html).toContain('Every bound holds on every judged planet and seed.')
  })

  it('prints the #385 share over the rarity-weighted hold beside the nominal one', () => {
    const html = renderRarityShares(tableOf(bandOf()))
    expect(html).toContain(
      '<td>P10</td><td>power.mineral_drain</td><td class="">14.21%</td><td>15.00%</td>',
    )
  })

  it('marks a band over its bound in red and lists what a reading missed', () => {
    const line = 'P3 seed 83921 band 5 trip: cvMaxBp 301 over 300'
    const html = renderRarityShares(tableOf(bandOf({ cvBp: 301 }), [line]))
    expect(html).toContain('<td class="bad">3.01%</td>')
    expect(html).toContain(`<li>${line}</li>`)
  })

  it("prints a story planet's boosted signature under its judged tiers", () => {
    const boosted = bandOf({ boostedTiersBp: { signature: 841 }, boostedMeanShiftBp: '142.07' })
    expect(renderRarityShares(tableOf(boosted))).toContain(
      'story boost: signature 841, mean 142.07 bp',
    )
  })

  it('shows a broken table as the panel failing, never the page', () => {
    expect(renderRaritySharesFailure('Unexpected token')).toContain('data-error="1"')
    expect(percentOfBasisPoints(1500)).toBe('15.00%')
  })
})
