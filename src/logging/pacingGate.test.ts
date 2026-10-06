import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { PACING_WORLD_SEEDS } from '../constants/pacingSeeds'
import { TICKS_PER_SECOND } from '../constants/physics'
import { cmp, fromCanonical, fromSafeInteger, mul } from '../systems/money'
import type { Scenario } from '../systems/scenario'
import { countDrillDives, diveTicksWithoutCasing } from './diveCasing'
import { RUN_EVENT_REGISTRY, type RegisteredEvent } from './eventNames'
import { formatNdjsonLine } from './ndjson'
import { formatSeedPacingTable, medianPacingReport, seededPacingReportsOf } from './pacingMedian'
import {
  derivePacingReport,
  formatPacingReport,
  formatPacingVerdicts,
  pacingAlerts,
  pacingProblems,
  pacingVerdicts,
} from './pacingReport'
import type { RunEvent } from './runEvent'
import { runEventProblems } from './runEventSchema'
import { deriveSummary } from './runSummary'
import {
  playLoggedSlice,
  playLoggedSliceOnSeeds,
  type LoggedSliceRun,
  type SeededSliceRun,
} from './sliceRunLog'
import { deriveWreckerDives, wreckerDiveLines } from './wreckerDiveReport'

const SCENARIO = JSON.parse(
  readFileSync(new URL('../../scenarios/bot-slice.scenario.json', import.meta.url), 'utf8'),
) as Scenario

/** #11 amendment 2: core events plus commands stay under 4 MB per player-hour. */
const BYTES_PER_HOUR_BUDGET = 4 * 1024 * 1024
const HOUR_TICKS = 60 * 60 * TICKS_PER_SECOND

/** The #2 acceptance sequence, in order, other lines allowed between (#24). */
const SLICE_SEQUENCE = [
  'game_started',
  'planet_entered',
  'resource_sold',
  'upgrade_purchased',
  'core_reached',
  'core_completed',
  'planet_unlocked',
  'planet_entered',
  'core_completed',
]

const WORLD_SEEDS = PACING_WORLD_SEEDS['bot-slice']

let seeded: SeededSliceRun[] | null = null

/** One logged bot run per pacing seed (#84), shared by the specs: about 100 minutes of slice each. */
function seededRuns(): SeededSliceRun[] {
  seeded ??= playLoggedSliceOnSeeds(SCENARIO, WORLD_SEEDS)
  return seeded
}

/** The run on the scenario's own world seed, the one the baseline and the log checks use. */
function botRun(): LoggedSliceRun {
  return seededRuns()[0]
}

function isSubsequence(names: readonly string[], log: readonly string[]): boolean {
  let next = 0
  for (const name of log) if (name === names[next]) next++
  return next === names.length
}

function isCoreLevel(event: RunEvent): boolean {
  const registered: RegisteredEvent = RUN_EVENT_REGISTRY[event.event]
  return 'level' in registered && registered.level === 'core'
}

function bytesOf(lines: readonly object[]): number {
  return lines.reduce((total, line) => total + formatNdjsonLine(line).length, 0)
}

// S11 (#65): the whole second slice (casing grades bought on-curve, collapse, the two bays) under
// the first slice's gates. A miss is a tuning ticket for Systems & Economy, never a scope change.
describe('balance regression: the pacing bot on the slice (#29, S11)', () => {
  it("plays the scenario's own world seed first, then two fixed others", () => {
    expect(WORLD_SEEDS).toHaveLength(3)
    expect(WORLD_SEEDS[0]).toBe(SCENARIO.worldSeed)
  })

  // #84: judged on the median of the seeded runs, so one run's combat deaths cannot flip a gate.
  it('meets the first-sale, first-upgrade, ten-minute, core and slice targets on the seed median', () => {
    const seeds = seededPacingReportsOf(seededRuns())
    const median = medianPacingReport(seeds.map((seed) => seed.report))
    const verdicts = formatPacingVerdicts(pacingVerdicts(median))
    const wrecker = wreckerDiveLines(deriveWreckerDives(botRun().events))
    console.log(
      `${formatSeedPacingTable(seeds)}\n\n${formatPacingReport(median)}\n\n${verdicts}\n` +
        [...pacingAlerts(median), ...wrecker].join('\n'),
    )
    expect(pacingProblems(median)).toEqual([])
  })

  it('lays casing on every drill dive through the player placement code, and pays for it (#115)', () => {
    const { events } = botRun()
    expect(countDrillDives(events)).toBeGreaterThan(0)
    expect(diveTicksWithoutCasing(events)).toEqual([])
    const { liningCharged, liningSpending, liningForgiven } = deriveSummary(events)
    console.log(
      `lining: ${liningCharged} charged, ${liningSpending} paid, ${liningForgiven} forgiven`,
    )
    expect(liningSpending).not.toBe('0e+0')
    // The bill settled at the Sell bay lands in full: at most a tenth of it forgiven (#115 ruling).
    const forgivenTenfold = mul(fromCanonical(liningForgiven), fromSafeInteger(10))
    expect(cmp(forgivenTenfold, fromCanonical(liningCharged))).toBeLessThanOrEqual(0)
  })

  it('emits only registered events, with registered fields and kinds', () => {
    expect(botRun().events.flatMap(runEventProblems)).toEqual([])
  })

  it('logs the #2 acceptance sequence, buying every one of the six tracks', () => {
    const names = botRun().events.map((event) => event.event)
    expect(isSubsequence(SLICE_SEQUENCE, names)).toBe(true)
    const report = derivePacingReport(botRun().events, SCENARIO.worldSeed)
    expect(Object.values(report.finalLevels).every((level) => level > 0)).toBe(true)
  })

  it('keeps the first hour of core events and commands under the 4 MB budget', () => {
    const { events, commands } = botRun()
    const coreEvents = events.filter((event) => event.tick <= HOUR_TICKS && isCoreLevel(event))
    const bytes = bytesOf(coreEvents) + bytesOf(commands.filter((c) => c.tick <= HOUR_TICKS))
    console.log(`first hour: ${(bytes / 1024 / 1024).toFixed(2)} MB of core events and commands`)
    expect(bytes).toBeLessThan(BYTES_PER_HOUR_BUDGET)
  })

  it('derives the same summary from a second run of the same scenario', () => {
    expect(deriveSummary(playLoggedSlice(SCENARIO).events)).toEqual(deriveSummary(botRun().events))
  })
})
