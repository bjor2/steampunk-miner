import { describe, expect, it } from 'vitest'
import type { RunEventData, RunEventName } from '../../logging/eventNames'
import { reportRowsOfRun } from '../../logging/reportRows'
import { LOG_SCHEMA_VERSION, type RunEvent } from '../../logging/runEvent'
import { COLLAPSE_DEATH_REPORT_ROWS_ID } from './collapseDeathReportRows'

function line<N extends RunEventName>(planet: number, event: N, data: RunEventData<N>): RunEvent {
  return {
    v: LOG_SCHEMA_VERSION,
    seq: 0,
    tick: 0,
    timestamp: 0,
    runId: 'run_test',
    playerId: 'p1',
    planet,
    depthTiles: 0,
    event,
    data,
  } as RunEvent
}

function destroyedBy(planet: number, cause: string): RunEvent {
  return line(planet, 'vehicle_destroyed', { cause, kind: 'none', tier: 0, arc: 'none' })
}

function collapseDeathRows(events: readonly RunEvent[]): string[] {
  return reportRowsOfRun({ worldSeed: 83921, events })
    .filter((row) => row.sourceId === COLLAPSE_DEATH_REPORT_ROWS_ID)
    .map((row) => `P${row.planet} ${row.label}: ${row.value}`)
}

describe('collapse death report rows (Systems ruling on #664)', () => {
  it('counts the rig destroyed by collapses on each planet the run logged', () => {
    const events = [
      destroyedBy(7, 'collapse'),
      destroyedBy(7, 'collapse'),
      destroyedBy(8, 'collapse'),
    ]
    expect(collapseDeathRows(events)).toEqual([
      'P7 rig destroyed by a collapse: 2',
      'P8 rig destroyed by a collapse: 1',
    ])
  })

  it('leaves deaths of every other cause out of the count', () => {
    const events = [destroyedBy(7, 'enemy'), destroyedBy(7, 'lava'), destroyedBy(7, 'heat')]
    expect(collapseDeathRows(events)).toEqual(['P7 rig destroyed by a collapse: 0'])
  })

  it('reports zero on a planet the rig survived', () => {
    const events = [line(3, 'tile_destroyed', { tx: 3, ty: 290, kind: 'ground' })]
    expect(collapseDeathRows(events)).toEqual(['P3 rig destroyed by a collapse: 0'])
  })
})
