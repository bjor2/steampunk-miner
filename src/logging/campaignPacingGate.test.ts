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
  campaignScalingProblemsBesideSawtooth,
  type CampaignGateRun,
} from './campaignScalingGate'
import { medianPacingReport, seededPacingReportsOf } from './pacingMedian'
import { deriveSummary } from './runSummary'
import {
  formatSawtoothSeedTable,
  SAWTOOTH_LEGS,
  sawtoothMissesOn,
  type SawtoothLeg,
} from './sawtoothMedian'
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

/** Every planet the bot leaves before the gate's last core: the planets the sawtooth judges. */
const JUDGED_PLANETS = Array.from({ length: LAST_PLANET - 1 }, (_, index) => index + 1)

/**
 * Rows held as todo, never as a pass (Game Director's addendum on #762): on seeds 31415 and 27182
 * the bot buys no drill level on planet 3, so band 5 leaves as slow as it came on both legs. They
 * come back when the bot's drill buy choice is fixed (#763).
 */
const HELD_FOR_BOT_DRILL_BUYS: readonly (readonly [number, SawtoothLeg])[] = [
  [3, 'down'],
  [3, 'sideways'],
]
const BOT_BUY_CHOICE_TICKET = 763

let seeded: SeededSliceRun[] | null = null
let gateRuns: CampaignGateRun[] | null = null

/** The bot scenario on each pacing seed (#84) to planet 8's core, as `balance:planets` plays it. */
function seededRuns(): SeededSliceRun[] {
  seeded ??= playLoggedSliceOnSeeds(SCENARIO, PACING_WORLD_SEEDS['bot-slice'], {
    lastPlanet: LAST_PLANET,
    maxTicks: BUDGET_TICKS,
  })
  return seeded
}

/** The seeded runs as the gate judges them, derived once for every row. */
function seededGateRuns(): CampaignGateRun[] {
  gateRuns ??= gateRunsOf(seededRuns())
  return gateRuns
}

function gateRunsOf(runs: readonly SeededSliceRun[]): CampaignGateRun[] {
  return runs.map((run) => ({
    worldSeed: run.worldSeed,
    summary: deriveSummary(run.events),
    hasCompletedLastCore: run.run.isFinished,
  }))
}

function isHeldForBotDrillBuys(planet: number, leg: SawtoothLeg): boolean {
  return HELD_FOR_BOT_DRILL_BUYS.some(([held, heldLeg]) => held === planet && heldLeg === leg)
}

function legRowName(planet: number, leg: SawtoothLeg): string {
  return `digs band 5 ${leg} at departure in at most 0.7x its arrival time on planet ${planet}, on the seed median`
}

// R1 (#89): the curve tickets (C1-C4) and the schedule runtime (H1-H2) held together. A miss is a
// balance finding for Systems & Economy, never a reason to retune the bot or a constant. Ticket 645
// deleted #417's known-red marker after R3's radius re-baseline: every problem fails.
//
// #723's drive-bound law (Game Director on #762, recorded as the "level-leg pacing re-pin
// (drive-bound)" under #644): every planet's band 5 is judged per leg through the upgrade that
// binds it, down through the drill and sideways through the slower of the drill and the drive,
// each leg a row of its own at the same 0.7x bar.
describe('balance regression: the campaign scaling gate on the pacing seeds (R1 #89)', () => {
  it('leaves no seed stalled before planet 8, judges a planet, and keeps the schedule cadence', () => {
    const runs = seededGateRuns()
    const median = medianPacingReport(
      seededPacingReportsOf(seededRuns()).map((seed) => seed.report),
    )
    console.log(`${formatSawtoothSeedTable(runs)}\n\n${campaignPacingFindings(median).join('\n')}`)
    expect(campaignScalingProblemsBesideSawtooth(runs, LOCKED_SCHEDULE, LAST_PLANET)).toEqual([])
  })

  for (const planet of JUDGED_PLANETS) {
    for (const leg of SAWTOOTH_LEGS) {
      if (isHeldForBotDrillBuys(planet, leg)) {
        it.todo(`${legRowName(planet, leg)} (held for #${BOT_BUY_CHOICE_TICKET})`)
        continue
      }
      it(legRowName(planet, leg), () => {
        expect(sawtoothMissesOn(seededGateRuns(), planet, leg)).toEqual([])
      })
    }
  }
})
