import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { SLICE_LAST_PLANET } from '../constants/balance'
import { PACING_TARGETS } from '../constants/pacingTargets'
import { PACING_WORLD_SEEDS } from '../constants/pacingSeeds'
import { TICKS_PER_SECOND } from '../constants/physics'
import type { Scenario } from '../systems/scenario'
import { LOCKED_SCHEDULE } from '../systems/unlocks/unlockSchedule'
import {
  campaignPacingFindings,
  campaignScalingProblems,
  type CampaignGateRun,
} from './campaignScalingGate'
import { medianPacingReport, seededPacingReportsOf } from './pacingMedian'
import { deriveSummary } from './runSummary'
import { formatSawtoothSeedTable } from './sawtoothMedian'
import { BOT_RUN_BUDGET_TICKS, playLoggedSliceOnSeeds, type SeededSliceRun } from './sliceRunLog'

const SCENARIO = JSON.parse(
  readFileSync(new URL('../../scenarios/bot-slice.scenario.json', import.meta.url), 'utf8'),
) as Scenario

const LAST_PLANET = PACING_TARGETS.campaignGateLastPlanet
const TICKS_PER_MINUTE = 60 * TICKS_PER_SECOND

/**
 * The slice's budget, then the longest core the later planets are allowed (#6 acceptance 7) for
 * each planet past it: a seed still playing then has stalled.
 */
const BUDGET_TICKS =
  BOT_RUN_BUDGET_TICKS +
  (LAST_PLANET - SLICE_LAST_PLANET) * PACING_TARGETS.laterPlanetCoreMinutes.max * TICKS_PER_MINUTE

let seeded: SeededSliceRun[] | null = null

/** The bot scenario on each pacing seed (#84) to planet 8's core, as `balance:planets` plays it. */
function seededRuns(): SeededSliceRun[] {
  seeded ??= playLoggedSliceOnSeeds(SCENARIO, PACING_WORLD_SEEDS['bot-slice'], {
    lastPlanet: LAST_PLANET,
    maxTicks: BUDGET_TICKS,
  })
  return seeded
}

function gateRunsOf(runs: readonly SeededSliceRun[]): CampaignGateRun[] {
  return runs.map((run) => ({
    worldSeed: run.worldSeed,
    summary: deriveSummary(run.events),
    hasCompletedLastCore: run.run.isFinished,
  }))
}

// R1 (#89): the curve tickets (C1-C4) and the schedule runtime (H1-H2) held together. A miss is a
// balance finding for Systems & Economy, never a reason to retune the bot or a constant.
describe('balance regression: the campaign scaling gate on the pacing seeds (R1 #89)', () => {
  it('digs band 5 at departure in at most 0.7x its arrival time on planets 1 to 7, on the seed median, with no seed stalled before planet 8', () => {
    const runs = gateRunsOf(seededRuns())
    const median = medianPacingReport(
      seededPacingReportsOf(seededRuns()).map((seed) => seed.report),
    )
    console.log(`${formatSawtoothSeedTable(runs)}\n\n${campaignPacingFindings(median).join('\n')}`)
    expect(campaignScalingProblems(runs, LOCKED_SCHEDULE, LAST_PLANET)).toEqual([])
  })
})
