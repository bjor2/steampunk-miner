import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { DomainEvent } from '../systems/authority/domainEvent'
import { recordDomainEvents } from './domainEventLog'
import { createMemorySink, type MemorySink } from './eventSink'
import { createRunLog, installRunLog, uninstallRunLog } from './runLog'
import { runEventProblems } from './runEventSchema'

// Each contact effect of #651's hazards, and a tool's acting flag, logs one schema-valid NDJSON
// line (ticket 848; design 37.5: a new gameplay action records its events from the start).

let sink: MemorySink

beforeEach(() => {
  sink = createMemorySink()
  installRunLog(createRunLog({ runId: 'run_test', sink, secondsSinceStart: () => 0 }))
})

afterEach(() => uninstallRunLog())

const stamp = { tick: 900, playerId: 'p1', seq: 4 }
const cell = { tx: 20, ty: 296 }

describe('hazard contact lines', () => {
  it('logs each contact effect and the acting flag as schema-valid lines', () => {
    const events: DomainEvent[] = [
      {
        ...stamp,
        type: 'HazardRefilled',
        kind: 'rockfall',
        ...cell,
        samples: 13,
        hullBp: 75,
        arc: 'front',
      },
      { ...stamp, type: 'HazardBit', kind: 'spinecrystal', ...cell, hullBp: 50, arc: 'side' },
      {
        ...stamp,
        type: 'HazardShoved',
        kind: 'steamvent',
        ...cell,
        hullBp: 50,
        arc: 'front',
        tiles: 3,
        toTx: 20,
        toTy: 300,
        untilTick: 920,
      },
      { ...stamp, type: 'HazardDrained', kind: 'firedamp', ...cell, ticks: 180, quanta: 5400 },
      { ...stamp, type: 'ToolActingChanged', toolId: 'planet-kit.scree_plough', on: true },
    ]
    recordDomainEvents({ playerId: 'p1', planet: 5, depthTiles: 12 }, events)
    expect(sink.events.map(({ event }) => event)).toEqual([
      'hazard_refill',
      'hazard_bite',
      'hazard_shove',
      'hazard_drain',
      'tool_acting',
    ])
    expect(sink.events.find(({ event }) => event === 'tool_acting')?.data).toEqual({
      toolId: 'planet-kit.scree_plough',
      on: true,
    })
    expect(sink.events.flatMap(runEventProblems)).toEqual([])
  })
})
