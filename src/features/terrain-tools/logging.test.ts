import { describe, expect, it } from 'vitest'
import { recordDomainEventsTo } from '../../logging/domainEventLog'
import { createMemorySink } from '../../logging/eventSink'
import { createRunLog } from '../../logging/runLog'
import { runEventProblems } from '../../logging/runEventSchema'
import type { DomainEvent } from '../../systems/authority/domainEvent'
import { dockInBay } from '../../systems/authority/scriptedSession'
import { FACING } from '../../systems/vehicle/vehiclePose'
import { LODESTONE_BEACON_ID } from './systems/lodestoneBeacon'
import { ORE_SHIFTER_ID } from './systems/oreShifter'
import { PRESSURE_POCKET_ID } from './systems/pressurePocket'
import { SEAM_SPLITTER_ID } from './systems/seamSplitter'
import { buriedTile, press, sessionWith, standAt } from './terrainTestSession'

// The terrain lines (#162 section 2.4, #162 acceptance 6): every `terrain_edit` names its tool,
// Mark, origin, cells changed at or under the TD cap, chunks touched and edit hash; a planted
// lodestone logs `beacon_planted`. Each line is checked against its registered schema.

/** The TD's caps in cells: 32 density cells or 64 swaps per activation, 256 per lodestone. */
const CELL_CAP: Readonly<Record<string, number>> = {
  [ORE_SHIFTER_ID]: 64,
  [SEAM_SPLITTER_ID]: 32,
  [PRESSURE_POCKET_ID]: 64,
  [LODESTONE_BEACON_ID]: 256,
}

function linesOf(events: readonly DomainEvent[]) {
  const sink = createMemorySink()
  const runLog = createRunLog({ runId: 'run_202', sink, secondsSinceStart: () => 0 })
  recordDomainEventsTo(runLog, { playerId: 'p1', planet: 1, depthTiles: 0 }, events)
  return sink.events.filter((line) => line.event.startsWith('terrain-tools.'))
}

/** The lines as plain names and fields, for reading a slice's own payloads. */
function plainLinesOf(events: readonly DomainEvent[]) {
  return linesOf(events).map(({ event, data }) => ({
    event: event as string,
    data: data as Record<string, unknown>,
  }))
}

/** Every tool used once, two at a time in the two open slots, then a dock for the beacon. */
function everyToolUsed(): DomainEvent[] {
  const first = sessionWith({ 'powerup.1': ORE_SHIFTER_ID, 'powerup.2': SEAM_SPLITTER_ID })
  standAt(first, 5, buriedTile(8), FACING.right)
  first.submit(10, press())
  standAt(first, 25, buriedTile(15), FACING.right)
  first.submit(30, press('powerup.2'))
  first.advanceTo(50)
  const second = sessionWith({ 'powerup.1': PRESSURE_POCKET_ID, 'powerup.2': LODESTONE_BEACON_ID })
  standAt(second, 5, buriedTile(9), FACING.right)
  second.submit(10, press())
  second.submit(30, press('powerup.2'))
  dockInBay(second, 60, 'sell')
  second.advanceTo(80)
  return [...first.events(), ...second.events()]
}

describe('terrain-tools logging', () => {
  it('logs a terrain_edit for each tool, at or under its cap, and the planted beacon', () => {
    const lines = plainLinesOf(everyToolUsed())
    const edits = lines.filter(({ event }) => event === 'terrain-tools.terrain_edit')
    expect(edits.map(({ data }) => data.itemId)).toEqual([
      ORE_SHIFTER_ID,
      SEAM_SPLITTER_ID,
      PRESSURE_POCKET_ID,
      LODESTONE_BEACON_ID,
    ])
    for (const { data } of edits) {
      expect(data).toMatchObject({
        mark: 0,
        origin: expect.any(Object),
        editHash: expect.any(String),
      })
      expect(data.cellsChanged as number).toBeGreaterThan(0)
      expect(data.cellsChanged as number).toBeLessThanOrEqual(CELL_CAP[data.itemId as string])
      expect(data.chunksTouched as number).toBeGreaterThan(0)
    }
    expect(lines.filter(({ event }) => event === 'terrain-tools.beacon_planted')).toHaveLength(1)
  })

  it('writes every line to its registered schema', () => {
    expect(linesOf(everyToolUsed()).flatMap(runEventProblems)).toEqual([])
  })
})
