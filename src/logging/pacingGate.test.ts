import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { PACING_WORLD_SEEDS } from '../constants/pacingSeeds'
import { TICKS_PER_SECOND } from '../constants/physics'
import { cmp, fromCanonical, fromSafeInteger, mul } from '../systems/money'
import type { Scenario } from '../systems/scenario'
import { loggedCommandsOf } from './commandLog'
import { countDrillDives, diveTicksWithoutCasing } from './diveCasing'
import { registeredEventOf } from './eventNames'
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
import {
  derivePlanetOneDrillPace,
  medianPlanetOneDrillPace,
  planetOneDrillPaceAlerts,
} from './planetOneDrillPace'
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

/**
 * #11 amendment 2: core events plus commands stay under the first-hour budget, the commands as
 * `commands.ndjson` writes them (changed pose fields only, drill runs as one line). The pose rate
 * stays 5 Hz: the #123 rulings retired #11's 4 Hz fallback. Ticket 420 (GD ruling on #396 Q4)
 * brings the budget back down from #396's interim 8 MB to 1.3x the first hour it measured with the
 * drill spans folded, 1,953,622 bytes, never above 4 MB. The log drops nothing at any speed, so the
 * budget is only this assert and can never act as a speed cap; real growth fails it.
 */
const MEASURED_FIRST_HOUR_BYTES = 1_953_622
const BYTES_PER_HOUR_BUDGET = Math.round(MEASURED_FIRST_HOUR_BYTES * 1.3)
const BYTES_PER_HOUR_CEILING = 4 * 1024 * 1024
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
  const registered = registeredEventOf(event.event)
  return registered !== undefined && 'level' in registered && registered.level === 'core'
}

/** Cells the drill broke: each drill span's, and any other tile's own line (ticket 420). */
function cellsBrokenIn(events: readonly RunEvent[]): number {
  return events.reduce((cells, event) => cells + cellsOfLine(event), 0)
}

function cellsOfLine(event: RunEvent): number {
  if (event.event === 'drill_cut') return (event as RunEvent<'drill_cut'>).data.cells
  return event.event === 'tile_destroyed' ? 1 : 0
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

  // Ticket 396's planet 1 drill speeds (3x the start by band 3, 10 cells/s on leaving), on the seed
  // median: printed only since ticket 552. VS (#551, 6254600977) and the GD ruling (6254611358)
  // supersede #396 for drill_power; #551's per-planet bars gate drill pace in drillPace.lane.test.ts.
  it('digs planet 1 to band 3 and leaves it, printing its band-1 drill speeds there', () => {
    const paces = seededRuns().map((run) => derivePlanetOneDrillPace(run.events, run.worldSeed))
    const median = medianPlanetOneDrillPace(paces)
    console.log('planet 1 drill pace (#396, printed):', median, planetOneDrillPaceAlerts(median))
    expect(median.bandThreeCellsPerSecond).not.toBeNull()
    expect(median.departureCellsPerSecond).not.toBeNull()
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

  it('keeps the first hour of core events and commands under 1.3x its measured bytes (ticket 420)', () => {
    const { events, commands } = botRun()
    const hourEvents = events.filter((event) => event.tick <= HOUR_TICKS)
    const coreEvents = hourEvents.filter(isCoreLevel)
    const loggedCommands = loggedCommandsOf(commands.filter((c) => c.tick <= HOUR_TICKS))
    const bytes = bytesOf(coreEvents) + bytesOf(loggedCommands)
    const cells = cellsBrokenIn(hourEvents)
    console.log(
      `first hour: ${(bytes / 1024 / 1024).toFixed(2)} MB of core events and commands, ` +
        `budget ${(BYTES_PER_HOUR_BUDGET / 1024 / 1024).toFixed(2)} MB; ` +
        `${cells} cells, ${Math.round(bytes / Math.max(cells, 1))} bytes a cell`,
    )
    expect(BYTES_PER_HOUR_BUDGET).toBeLessThanOrEqual(BYTES_PER_HOUR_CEILING)
    expect(bytes).toBeLessThan(BYTES_PER_HOUR_BUDGET)
  })

  it('derives the same summary from a second run of the same scenario', () => {
    expect(deriveSummary(playLoggedSlice(SCENARIO).events)).toEqual(deriveSummary(botRun().events))
  })
})
