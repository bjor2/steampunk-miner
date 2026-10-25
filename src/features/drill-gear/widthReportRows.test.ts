import { describe, expect, it } from 'vitest'
import type { RunEventData, RunEventName } from '../../logging/eventNames'
import { reportRowsOfRun } from '../../logging/reportRows'
import { LOG_SCHEMA_VERSION, type RunEvent } from '../../logging/runEvent'
import { WIDTH_REPORT_ROWS_ID } from './widthReportRows'

// The bore width's report rows (ticket 749, the VS pacing guard on #662 Part B): per planet, the
// width level at arrival, the width spend there and the width cells broken past the bare bore.

function line<N extends RunEventName>(
  planet: number,
  event: N,
  data: RunEventData<N>,
  depthTiles = 0,
): RunEvent {
  return {
    v: LOG_SCHEMA_VERSION,
    seq: 0,
    tick: 0,
    timestamp: 0,
    runId: 'run_test',
    playerId: 'p1',
    planet,
    depthTiles,
    event,
    data,
  } as RunEvent
}

function bought(planet: number, itemId: string, price: string): RunEvent {
  return line(planet, 'vehicle_item_purchased', { itemId, price })
}

function cut(planet: number, depthTiles: number, widthCells?: number): RunEvent {
  const data = {
    spans: 1,
    cells: 4,
    ...(widthCells === undefined ? {} : { widthCells }),
    ticks: 10,
    units: 0,
    value: '0',
    ores: [],
    energy: 0,
    heat: 0,
    stop: 'end' as const,
  }
  return line(planet, 'drill_cut', data, depthTiles)
}

function forkChosen(planet: number, branch: string): RunEvent {
  return {
    ...line(planet, 'tile_destroyed', { tx: 0, ty: 0, kind: 'ground' }),
    event: 'tech-tree.fork_chosen',
    data: { lane: 'drill-gear', branch, cost: '1' },
  } as unknown as RunEvent
}

function widthRows(events: readonly RunEvent[]): string[] {
  return reportRowsOfRun({ worldSeed: 83921, events })
    .filter((row) => row.sourceId === WIDTH_REPORT_ROWS_ID)
    .map((row) => `P${row.planet} ${row.label}: ${row.value}`)
}

describe('bore width report rows (ticket 749)', () => {
  it('reports a bare rig at width level 0 with no width spend or cells', () => {
    expect(widthRows([cut(1, 40)])).toEqual([
      'P1 width level at arrival: 0',
      'P1 width spend: 0',
      'P1 width cells: 0',
      'P1 width cells a metre: 0.00',
    ])
  })

  it('reads the level each planet was entered at from the width parts bought before it', () => {
    const events = [
      cut(1, 10),
      bought(1, 'gear.side_cutters', '120'),
      cut(2, 50, 75),
      bought(2, 'gear.side_cutters_mark_2', '300'),
      forkChosen(2, 'wide'),
      cut(3, 20, 60),
    ]
    expect(widthRows(events)).toEqual([
      'P1 width level at arrival: 0',
      'P1 width spend: 120',
      'P1 width cells: 0',
      'P1 width cells a metre: 0.00',
      'P2 width level at arrival: 1',
      'P2 width spend: 300',
      'P2 width cells: 75',
      'P2 width cells a metre: 1.50',
      'P3 width level at arrival: 3',
      'P3 width spend: 0',
      'P3 width cells: 60',
      'P3 width cells a metre: 3.00',
    ])
  })

  it('counts no width level for Deep, and drops Wide’s once the lane re-chooses Deep', () => {
    const rechosen = {
      ...forkChosen(1, 'wide'),
      event: 'tech-tree.fork_rechosen',
      data: { lane: 'drill-gear', from: 'wide', to: 'deep', cost: '1' },
    } as unknown as RunEvent
    expect(widthRows([forkChosen(1, 'wide'), cut(1, 5), cut(2, 5)])[4]).toBe(
      'P2 width level at arrival: 1',
    )
    expect(widthRows([forkChosen(1, 'wide'), rechosen, cut(1, 5), cut(2, 5)])[4]).toBe(
      'P2 width level at arrival: 0',
    )
  })
})
