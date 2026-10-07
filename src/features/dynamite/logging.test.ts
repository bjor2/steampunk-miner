import { describe, expect, it } from 'vitest'
import { recordDomainEventsTo } from '../../logging/domainEventLog'
import { createMemorySink } from '../../logging/eventSink'
import { createRunLog } from '../../logging/runLog'
import { runEventProblems } from '../../logging/runEventSchema'
import {
  plantSized,
  poseOnTile,
  sizedBlasterOn,
} from '../../systems/authority/charges/chargeFixtures'
import type { DomainEvent } from '../../systems/authority/domainEvent'
import { DETONATE_INTENT } from './systems/dynamiteCommands'

// The plunger's lines as the run log records them (#153 consequence 2, the #189 lock), each checked
// against its registered schema.

const PLUNGER_LINES: ReadonlySet<string> = new Set([
  'dynamite.detonate_refused',
  'charge_detonated',
])

function linesOf(events: readonly DomainEvent[]) {
  const sink = createMemorySink()
  const runLog = createRunLog({ runId: 'run_149', sink, secondsSinceStart: () => 0 })
  recordDomainEventsTo(runLog, { playerId: 'p1', planet: 25, depthTiles: 0 }, events)
  return sink.events.filter((line) => PLUNGER_LINES.has(line.event))
}

/** A size-7 charge clunked from beside it, then fired from 20 tiles away. */
function clunkedThenFired(): DomainEvent[] {
  const blaster = sizedBlasterOn(25, 7)
  const { session, wall } = blaster
  plantSized(session, blaster, 7, 1)
  session.submit(2, DETONATE_INTENT)
  session.submit(3, poseOnTile({ tx: wall.tx - 20, ty: wall.ty }))
  session.submit(4, DETONATE_INTENT)
  return session.events()
}

describe('dynamite log lines', () => {
  it('logs a clunked plunger as detonate_refused and a fired one as charge_detonated by plunger', () => {
    expect(linesOf(clunkedThenFired()).map(({ event, data }) => ({ event, data }))).toEqual([
      { event: 'dynamite.detonate_refused', data: { reason: 'in_radius', size: 7 } },
      {
        event: 'charge_detonated',
        data: expect.objectContaining({ size: 7, radiusMm: 13000, by: 'plunger' }),
      },
    ])
  })

  it('writes every line to its registered schema', () => {
    expect(linesOf(clunkedThenFired()).flatMap(runEventProblems)).toEqual([])
  })
})
