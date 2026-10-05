import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { Scenario } from '../systems/scenario'
import {
  derivePacingReport,
  formatPacingReport,
  formatPacingVerdicts,
  pacingProblems,
  pacingVerdicts,
} from './pacingReport'
import { playLoggedSlice } from './sliceRunLog'

const SCENARIO = JSON.parse(
  readFileSync(new URL('../../scenarios/bot-slice-assay.scenario.json', import.meta.url), 'utf8'),
) as Scenario

// #46 acceptance 6 and S11 (#65 Systems & Economy note 3): assay_beacon lifts early-band income
// toward mid-band, so the bot holding it from the start must pass the same three gates as the bot
// without it: the #16 first ten minutes, planet 1's core in 30-60 min and the slice in 90-130 min.
// A miss is a tuning ticket for Systems & Economy, never a reason to retune the bot or a constant.
describe('balance regression: the pacing bot holding assay_beacon (#46, S11)', () => {
  it('passes the first-ten-minutes, planet 1 core and slice gates', () => {
    const { events } = playLoggedSlice(SCENARIO)
    const report = derivePacingReport(events, SCENARIO.worldSeed)
    console.log(`${formatPacingReport(report)}\n\n${formatPacingVerdicts(pacingVerdicts(report))}`)
    expect(pacingProblems(report)).toEqual([])
    expect(events.some((event) => event.event === 'artefact_assay_applied')).toBe(true)
  })
})
