import { describe, expect, it } from 'vitest'
import { recordDomainEventsTo } from '../../logging/domainEventLog'
import { createMemorySink } from '../../logging/eventSink'
import { createRunLog } from '../../logging/runLog'
import { runEventProblems } from '../../logging/runEventSchema'
import { withRegistrations } from '../../registries/registrar'
import type { SliceDefinition } from '../../registries/sliceDefinition'
import type { DomainEvent } from '../../systems/authority/domainEvent'
import { DRILL_GEAR_PROJECTIONS, DRILL_GEAR_RUN_EVENTS } from './logging'

// The drill-gear lines (design 37.5) as the run log records them, each checked against its
// registered schema.

const LOGGING_SLICE: SliceDefinition = {
  id: 'drill-gear',
  register(r) {
    r.eventProjections(DRILL_GEAR_PROJECTIONS)
    r.runEvents(DRILL_GEAR_RUN_EVENTS)
  },
}

const EVENTS: DomainEvent[] = [
  { tick: 61, playerId: 'p1', type: 'drill-gear.GroundCrumbled', tx: 30, ty: 284 },
  { tick: 70, playerId: 'p1', type: 'drill-gear.TunnelBackfilled', tx: 30, ty: 288 },
  {
    tick: 80,
    playerId: 'p1',
    type: 'drill-gear.OreSampled',
    tx: 30,
    ty: 279,
    oreId: 'kernel.metal.t1',
  },
]

function linesOf(events: readonly DomainEvent[]) {
  const sink = createMemorySink()
  const runLog = createRunLog({ runId: 'run_205', sink, secondsSinceStart: () => 0 })
  withRegistrations([LOGGING_SLICE], () =>
    recordDomainEventsTo(runLog, { playerId: 'p1', planet: 1, depthTiles: 0 }, events),
  )
  return sink.events.filter((line) => line.event.startsWith('drill-gear.'))
}

describe('drill-gear log lines', () => {
  it('logs the crumble, the backfill and the plug with their tiles', () => {
    expect(linesOf(EVENTS).map(({ event, data }) => ({ event, data }))).toEqual([
      { event: 'drill-gear.ground_crumbled', data: { tx: 30, ty: 284 } },
      { event: 'drill-gear.tunnel_backfilled', data: { tx: 30, ty: 288 } },
      { event: 'drill-gear.ore_sampled', data: { tx: 30, ty: 279, oreId: 'kernel.metal.t1' } },
    ])
  })

  it('writes every line to its registered schema', () => {
    const lines = linesOf(EVENTS)
    const problems = withRegistrations([LOGGING_SLICE], () => lines.flatMap(runEventProblems))
    expect(problems).toEqual([])
  })
})
