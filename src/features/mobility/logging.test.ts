import { describe, expect, it } from 'vitest'
import { recordDomainEventsTo } from '../../logging/domainEventLog'
import { createMemorySink } from '../../logging/eventSink'
import { createRunLog } from '../../logging/runLog'
import { runEventProblems } from '../../logging/runEventSchema'
import type { DomainEvent } from '../../systems/authority/domainEvent'
import { GROUND } from '../../systems/authority/scriptedSession'
import { FACING } from '../../systems/vehicle/vehiclePose'
import { MM, poseAt, press, sessionWith, standInCavity } from './mobilityTestSession'
import { MOBILITY_ITEM } from './systems/itemIds'

// The mobility lines (#162 section 2.4) as the run log records them, each checked against its
// registered schema: where a grapple hooked, a plated hull, a patch cancelled by a move.

function linesOf(events: readonly DomainEvent[]) {
  const sink = createMemorySink()
  const runLog = createRunLog({ runId: 'run_204', sink, secondsSinceStart: () => 0 })
  recordDomainEventsTo(runLog, { playerId: 'p1', planet: 1, depthTiles: 0 }, events)
  return sink.events.filter((line) => line.event.startsWith('mobility.'))
}

function grappleAndPatches(): DomainEvent[] {
  const session = sessionWith({
    'powerup.1': MOBILITY_ITEM.grappleWinch,
    'powerup.2': MOBILITY_ITEM.rivetPatch,
  })
  session.submit(2, { type: 'debug.setHull', payload: { hull: '10' } })
  standInCavity(session, 5, FACING.up)
  session.submit(10, press())
  session.submit(150, press('powerup.2'))
  session.advanceTo(260)
  session.submit(260, press('powerup.2'))
  session.advanceTo(270)
  session.submit(270, poseAt(GROUND.tx * MM, (GROUND.ty + 1) * MM, FACING.right, { vx: 900 }))
  session.advanceTo(280)
  return session.events()
}

describe('mobility logging', () => {
  it('logs a hook, a plated hull and a cancelled patch with the units left', () => {
    const lines = linesOf(grappleAndPatches()).map(({ event, data }) => ({ event, data }))
    expect(lines).toEqual([
      {
        event: 'mobility.grapple_hooked',
        data: { hook: expect.any(Object), to: expect.any(Object) },
      },
      {
        event: 'mobility.hull_patched',
        data: { amount: expect.any(String), hullAfter: expect.any(String) },
      },
      { event: 'mobility.patch_cancelled', data: { chargesLeft: 1 } },
    ])
  })

  it('writes every line to its registered schema', () => {
    expect(linesOf(grappleAndPatches()).flatMap(runEventProblems)).toEqual([])
  })
})
