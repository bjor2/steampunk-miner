import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { PACING_WORLD_SEEDS } from '../constants/pacingSeeds'
import type { Scenario } from '../systems/scenario'
import { countDrillDives, diveTicksWithoutCasing } from './diveCasing'
import { formatSeedPacingTable, medianPacingReport, seededPacingReportsOf } from './pacingMedian'
import {
  formatPacingReport,
  formatPacingVerdicts,
  pacingProblems,
  pacingVerdicts,
} from './pacingReport'
import { playLoggedSliceOnSeeds } from './sliceRunLog'

const SCENARIO = JSON.parse(
  readFileSync(new URL('../../scenarios/bot-slice-assay.scenario.json', import.meta.url), 'utf8'),
) as Scenario

const WORLD_SEEDS = PACING_WORLD_SEEDS['bot-slice-assay']

// #46 acceptance 6 and S11 (#65 Systems & Economy note 3): assay_beacon lifts early-band income
// toward mid-band, so the bot holding it from the start must pass the same three gates as the bot
// without it: the #16 first ten minutes, planet 1's core in 30-60 min and the slice in 90-130 min.
// A miss is a tuning ticket for Systems & Economy, never a reason to retune the bot or a constant.
// #84: the gates judge the median of the scenario played on its three pacing world seeds.
describe('balance regression: the pacing bot holding assay_beacon (#46, S11)', () => {
  it("plays the scenario's own world seed first, then two fixed others", () => {
    expect(WORLD_SEEDS).toHaveLength(3)
    expect(WORLD_SEEDS[0]).toBe(SCENARIO.worldSeed)
  })

  it('passes the first-ten-minutes, planet 1 core and slice gates on the seed median', () => {
    const runs = playLoggedSliceOnSeeds(SCENARIO, WORLD_SEEDS)
    const seeds = seededPacingReportsOf(runs)
    const median = medianPacingReport(seeds.map((seed) => seed.report))
    const verdicts = formatPacingVerdicts(pacingVerdicts(median))
    console.log(`${formatSeedPacingTable(seeds)}\n\n${formatPacingReport(median)}\n\n${verdicts}`)
    expect(pacingProblems(median)).toEqual([])
    for (const { events } of runs) {
      expect(events.some((event) => event.event === 'artefact_assay_applied')).toBe(true)
      // #115: the bot's drilling lays casing as a player's does, on every dive.
      expect(countDrillDives(events)).toBeGreaterThan(0)
      expect(diveTicksWithoutCasing(events)).toEqual([])
    }
  })
})
