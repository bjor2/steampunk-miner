import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { TICKS_PER_SECOND } from '../constants/physics'
import type { Scenario } from '../systems/scenario'
import { expandCommandLog, loggedCommandsOf } from './commandLog'
import { countDrillDives, diveTicksWithoutCasing } from './diveCasing'
import { startMoneyLaneFold } from './moneyLaneLines'
import { formatNdjsonLine } from './ndjson'
import { derivePacingReport } from './pacingReport'
import { derivePlanetOneDrillPace } from './planetOneDrillPace'
import type { RunEvent } from './runEvent'
import { runEventProblems } from './runEventSchema'
import { deriveSummary } from './runSummary'
import { playLoggedSlice, type LoggedSliceRun } from './sliceRunLog'

// Ticket 420 acceptance 2 (TD spec on #396, GD ruling Q2, the Horizontal Scaler's condition): the
// bot's first hour logged both ways from the same play, the drill spans folded and one line per
// cell as before, must read the same everywhere it is read. Kept after the change, as ruled.

const SCENARIO = JSON.parse(
  readFileSync(new URL('../../scenarios/bot-slice.scenario.json', import.meta.url), 'utf8'),
) as Scenario
const HOUR_TICKS = 60 * 60 * TICKS_PER_SECOND

/** The per-cell lines a drill span folds; every other line must stay as it was. */
const FOLDED_LINES = new Set([
  'tile_destroyed',
  'drill_damage_dealt',
  'casing_placed',
  'resource_collected',
  'casing_lined',
  'drill_cut',
])

let hours: { spans: LoggedSliceRun; cells: LoggedSliceRun } | null = null

function botHours() {
  hours ??= {
    spans: playLoggedSlice(SCENARIO, { maxTicks: HOUR_TICKS }),
    cells: playLoggedSlice(SCENARIO, { maxTicks: HOUR_TICKS, drillLines: 'cells' }),
  }
  return hours
}

/** A line as written, without the `seq` that counts the lines before it. */
function lineWithoutSeq({ seq: _seq, ...line }: RunEvent): string {
  return formatNdjsonLine(line)
}

function unfoldedLinesOf(events: readonly RunEvent[]): string[] {
  return events.filter((event) => !FOLDED_LINES.has(event.event)).map(lineWithoutSeq)
}

function summaryWithoutLineCount(events: readonly RunEvent[]) {
  const { eventCount: _lines, ...summary } = deriveSummary(events)
  return summary
}

function moneyLaneOf(events: readonly RunEvent[]) {
  const fold = startMoneyLaneFold()
  events.forEach(fold.add)
  return fold.summarize()
}

describe('log compaction on the bot hour (ticket 420)', () => {
  it('plays the same hour whichever way it logs: the domain events are identical', () => {
    const { spans, cells } = botHours()
    expect(spans.run.events.length).toBeGreaterThan(0)
    expect(JSON.stringify(spans.run.events)).toBe(JSON.stringify(cells.run.events))
    expect(spans.commands).toEqual(cells.commands)
  })

  it("expands the hour's logged commands back to exactly the commands sent", () => {
    const { commands } = botHours().spans
    expect(expandCommandLog(loggedCommandsOf(commands))).toEqual(commands)
  })

  it('keeps every line it does not fold byte for byte, unlocks and ore firsts included', () => {
    const { spans, cells } = botHours()
    expect(unfoldedLinesOf(spans.events)).toEqual(unfoldedLinesOf(cells.events))
    expect(spans.events.flatMap(runEventProblems)).toEqual([])
  })

  it('reads the same pacing, drill pace, dive casing, summary and money lane off both logs', () => {
    const { spans, cells } = botHours()
    const seed = SCENARIO.worldSeed
    expect(derivePacingReport(spans.events, seed)).toEqual(derivePacingReport(cells.events, seed))
    expect(derivePlanetOneDrillPace(spans.events, seed)).toEqual(
      derivePlanetOneDrillPace(cells.events, seed),
    )
    expect(countDrillDives(spans.events)).toBe(countDrillDives(cells.events))
    expect(diveTicksWithoutCasing(spans.events)).toEqual(diveTicksWithoutCasing(cells.events))
    expect(summaryWithoutLineCount(spans.events)).toEqual(summaryWithoutLineCount(cells.events))
    expect(moneyLaneOf(spans.events)).toEqual(moneyLaneOf(cells.events))
  })

  it('writes far fewer lines for the drilling it folds', () => {
    const { spans, cells } = botHours()
    const folded = (events: readonly RunEvent[]) =>
      events.filter((event) => FOLDED_LINES.has(event.event)).length
    console.log(
      `bot hour: ${folded(cells.events)} per-cell lines, ${folded(spans.events)} span lines`,
    )
    expect(folded(spans.events) * 4).toBeLessThan(folded(cells.events))
  })
})
