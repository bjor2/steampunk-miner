import { describe, expect, it } from 'vitest'
import { recordDomainEventsTo } from '../../logging/domainEventLog'
import { createMemorySink } from '../../logging/eventSink'
import { createRunLog } from '../../logging/runLog'
import { runEventProblems } from '../../logging/runEventSchema'
import type { RunEvent } from '../../logging/runEvent'
import type { DomainEvent } from '../../systems/authority/domainEvent'
import { floor, fromCanonical, fromSafeInteger, mul, toSafeInteger } from '../../systems/money'
import { describeItem } from '../../systems/registries/itemDescriber'
import { itemSnapshotViewOf } from '../../systems/registries/itemSnapshotView'
import {
  ACT_TICK,
  drainSessionAt,
  press,
  PRESS_TICK,
  standingTileWithOre,
} from './drainTestSession'
import { incomeReportRows } from './incomeReportRows'

// What the drain leaves for people to read (#162 2.4, acceptance 4; #164 Systems): the
// `drain_yield` line to its schema, the item card's trip cap line agreeing with the line's
// `tripCapFraction`, and the report's per-band share of the band's ore.

const ORIGIN = standingTileWithOre(5)

function drainedSession() {
  const session = drainSessionAt(ORIGIN)
  session.submit(PRESS_TICK, press())
  session.advanceTo(ACT_TICK + 4)
  return session
}

function linesOf(events: readonly DomainEvent[], planet = 1): readonly RunEvent[] {
  const sink = createMemorySink()
  const runLog = createRunLog({ runId: 'run_201', sink, secondsSinceStart: () => 0 })
  recordDomainEventsTo(runLog, { playerId: 'p1', planet, depthTiles: 0 }, events)
  return sink.events
}

const drainYieldLines = (lines: readonly RunEvent[]) =>
  lines.filter((line) => String(line.event) === 'extraction.drain_yield')

describe('drain lines, card and report', () => {
  it('logs drain_yield with the value, the trip cap fraction and the band, to its schema', () => {
    const lines = drainYieldLines(linesOf(drainedSession().events()))
    expect(lines.map((line) => line.data)).toEqual([
      {
        itemId: 'power.mineral_drain',
        value: expect.any(String),
        tripCapFraction: expect.any(String),
        band: 1,
        cells: expect.any(Number),
        units: 1,
      },
    ])
    expect(lines.flatMap(runEventProblems)).toEqual([])
  })

  it('prints the same whole percent on the card as the logged fraction, floored', () => {
    const session = drainedSession()
    const [line] = drainYieldLines(linesOf(session.events()))
    const fraction = fromCanonical((line.data as { tripCapFraction: string }).tripCapFraction)
    const percent = toSafeInteger(floor(mul(fromSafeInteger(100), fraction)))
    const card = describeItem(
      { kind: 'vehicle-item', id: 'power.mineral_drain' },
      { playerId: 'p1', planetIndex: 1, level: 0, view: itemSnapshotViewOf(session.state(), 'p1') },
    )
    const tripLine = card?.statLines.find((statLine) => statLine.label.startsWith('Trip cap'))
    expect(tripLine?.now).toBe(String(percent))
    expect(percent).toBeGreaterThan(0)
  })

  it('reports per band the largest trip share of the band ore, never past 15%', () => {
    const lines = linesOf(drainedSession().events(), 9)
    const rows = incomeReportRows.rowsOf(lines, 83921, 9)
    expect(rows[0]).toEqual({ label: 'income item uses', value: '1' })
    expect(rows[1].value).toMatch(
      /^band 1 \d+(\.\d+)?%, band 2 none, band 3 none, band 4 none, band 5 none$/,
    )
    const share = Number(/band 1 ([\d.]+)%/.exec(rows[1].value)?.[1])
    expect(share).toBeLessThanOrEqual(15)
  })

  it('prints no row on a planet before the drain with no drain line', () => {
    expect(incomeReportRows.rowsOf([], 83921, 3)).toEqual([])
    expect(incomeReportRows.rowsOf([], 83921, 9)).toEqual([
      { label: 'income item uses', value: '0' },
      {
        label: 'income items per trip, share of band ore by band',
        value: 'band 1 none, band 2 none, band 3 none, band 4 none, band 5 none',
      },
    ])
  })
})
