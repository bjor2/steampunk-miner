import { describe, expect, it } from 'vitest'
import { DEEP_RARE_WINDOW_ORE_RULES, planetParamsFor } from '../../../systems/world/planetParams'
import { oreMixOf } from '../../planet-mix'
import { paintedPlanetOf } from './paintedPlanet'
import { paintingsOf } from './planetShares'
import { tripLedgerOf } from './tripLedger'

// The trip ledger of ticket 449: the exact walk over the clamp's states and the seeded trips read
// the same trips, and the walk's clamp cost matches an independent whole-fraction model of P3
// band 5 (the mixed rows with the 300 bp signature, a 90-unit hold, the 1500 bp clamp): 0.90898 bp.
// The model is of the mixed rows, so P3 is painted as a planet entered under ore rules 10 draws it,
// before the deep rows (ticket 738).

const SEEDS = [83921, 31415, 27182]
const MIXED_P3 = planetParamsFor(83921, 3, DEEP_RARE_WINDOW_ORE_RULES - 1)
const P3_BAND_5 = paintedPlanetOf(MIXED_P3, oreMixOf(MIXED_P3)).bands[4]
const P3_PATCH = { planetIndex: 3, band: 5, hold: 90 }

describe('rarity trip ledger', () => {
  it("costs P3 band 5 the clamp's exact 0.909 bp of mean income", () => {
    const ledger = tripLedgerOf(P3_BAND_5, P3_PATCH, SEEDS, 1000)
    expect(ledger.clampLossBp).toBeCloseTo(0.90898, 4)
    expect(ledger.meanPaidOfExpected).toBeCloseTo(1 - 0.90898 / 10000, 8)
  })

  it('spreads the seeded trips as the exact walk says, within sampling error', () => {
    const ledger = tripLedgerOf(P3_BAND_5, P3_PATCH, SEEDS, 1_000_000)
    // CV 2.81%: 33k trips put the 99.9th percentile near 1 + 3.09 x CV of the expected trip.
    expect(ledger.cvBp).toBe(281)
    expect(ledger.p999OfExpectedBp).toBeGreaterThan(10800)
    expect(ledger.p999OfExpectedBp).toBeLessThan(11200)
  })

  it('takes no income from a band without epic or mythic and never pays them past the clamp', () => {
    const p1 = paintingsOf(83921, 1).real.bands[4]
    const ledger = tripLedgerOf(p1, { planetIndex: 1, band: 5, hold: 42 }, SEEDS, 100_000)
    expect([ledger.clampLossBp, ledger.worstEpicAndMythicBp, ledger.meanPaidOfExpected]).toEqual([
      0, 0, 1,
    ])
    expect(
      tripLedgerOf(P3_BAND_5, P3_PATCH, SEEDS, 1_000_000).worstEpicAndMythicBp,
    ).toBeLessThanOrEqual(1500)
  })

  it('draws the same trips from the same seeds', () => {
    expect(tripLedgerOf(P3_BAND_5, P3_PATCH, SEEDS, 50_000)).toEqual(
      tripLedgerOf(P3_BAND_5, P3_PATCH, SEEDS, 50_000),
    )
  })
})
