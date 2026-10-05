import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { PACING_TARGETS } from '../constants/pacingTargets'
import { TICKS_PER_SECOND } from '../constants/physics'
import type { Scenario } from '../systems/scenario'
import { derivePacingReport, formatPacingReport } from './pacingReport'
import { playLoggedSlice } from './sliceRunLog'

const SCENARIO = JSON.parse(
  readFileSync(new URL('../../scenarios/bot-slice-assay.scenario.json', import.meta.url), 'utf8'),
) as Scenario

const TICKS_PER_MINUTE = 60 * TICKS_PER_SECOND

// #46 economy impact and acceptance 6: assay_beacon lifts early-band income toward mid-band, and
// the #6 regression bot holding it from the start must still reach planet 1's core in 30-60 min.
describe('balance regression: the pacing bot holding assay_beacon (#46)', () => {
  it('still completes the planet 1 core inside the 30 to 60 minute gate', () => {
    const { events } = playLoggedSlice(SCENARIO)
    const report = derivePacingReport(events, SCENARIO.worldSeed)
    console.log(formatPacingReport(report))
    const minutes = (report.coreCompletedTick['1'] ?? Number.POSITIVE_INFINITY) / TICKS_PER_MINUTE
    const { min, max } = PACING_TARGETS.planet1CoreMinutes
    expect(minutes).toBeGreaterThanOrEqual(min)
    expect(minutes).toBeLessThanOrEqual(max)
    expect(events.some((event) => event.event === 'artefact_assay_applied')).toBe(true)
  })
})
