import { describe, expect, it } from 'vitest'
import type { RunEventData, RunEventName } from '../../logging/eventNames'
import { reportRowsOfRun } from '../../logging/reportRows'
import { LOG_SCHEMA_VERSION, type RunEvent } from '../../logging/runEvent'
import { blockContaining, blockIdOf } from '../../systems/world/collapseBlock'
import { GNAW_COLLAPSE_REPORT_ROWS_ID } from './gnawCollapseReportRows'

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

/** A ring gnawed in the middle of the block round (2 m, 2 m) on planet 7. */
const RING = { xMm: 2000, yMm: 2000 }
const RING_BLOCK = blockIdOf(blockContaining(RING))
/** The block east of it, whose west edge the ring's walls reach past 1.45 m out. */
const BLOCK_EAST = blockIdOf(blockContaining({ xMm: 4500, yMm: 2000 }))
const FAR_BLOCK = blockIdOf(blockContaining({ xMm: 40000, yMm: 2000 }))

const gnawed = (planet: number, xMm = RING.xMm) =>
  line(planet, 'ring_gnawed', { ring: `${xMm},${RING.yMm}`, band: 3 })
const collapsed = (planet: number, block: string, vehiclesHit = 0) =>
  line(planet, 'collapse', { block, samplesFilled: 40, vehiclesHit })

function gnawCollapseRows(events: readonly RunEvent[]): string[] {
  return reportRowsOfRun({ worldSeed: 83921, events })
    .filter((row) => row.sourceId === GNAW_COLLAPSE_REPORT_ROWS_ID)
    .map((row) => `P${row.planet} ${row.label}: ${row.value}`)
}

describe('gnaw collapse report rows (Systems ruling (C) on #676)', () => {
  it('counts a collapse of a block a gnawed ring sits in as after a gnaw, with its vehicle hits', () => {
    expect(gnawCollapseRows([gnawed(7), collapsed(7, RING_BLOCK, 1)])).toEqual([
      'P7 collapses after a gnaw: 1',
      'P7 collapses with no gnaw: 0',
      'P7 vehicle hits by collapses after a gnaw: 1',
    ])
  })

  it('counts the block next door whose air a gnawed ring borders as after a gnaw too', () => {
    const events = [gnawed(7, 3500), collapsed(7, BLOCK_EAST)]
    expect(gnawCollapseRows(events)[0]).toBe('P7 collapses after a gnaw: 1')
  })

  it('counts a collapse far from every gnawed ring, or before the gnaw, as with no gnaw', () => {
    const events = [collapsed(7, RING_BLOCK, 1), gnawed(7), collapsed(7, FAR_BLOCK, 1)]
    expect(gnawCollapseRows(events)).toEqual([
      'P7 collapses after a gnaw: 0',
      'P7 collapses with no gnaw: 2',
      'P7 vehicle hits by collapses after a gnaw: 0',
    ])
  })

  it('spends a gnaw on the first collapse of its block: the refill clears the breach', () => {
    const events = [gnawed(7), collapsed(7, RING_BLOCK), collapsed(7, RING_BLOCK)]
    expect(gnawCollapseRows(events).slice(0, 2)).toEqual([
      'P7 collapses after a gnaw: 1',
      'P7 collapses with no gnaw: 1',
    ])
  })

  it("keeps each planet's gnaws to itself", () => {
    const events = [gnawed(6), collapsed(7, RING_BLOCK)]
    expect(gnawCollapseRows(events)).toContain('P7 collapses with no gnaw: 1')
    expect(gnawCollapseRows(events)).toContain('P6 collapses after a gnaw: 0')
  })
})
