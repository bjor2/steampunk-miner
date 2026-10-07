import { describe, expect, it } from 'vitest'
import { recordDomainEventsTo } from '../../logging/domainEventLog'
import { createMemorySink } from '../../logging/eventSink'
import { createRunLog } from '../../logging/runLog'
import { runEventProblems } from '../../logging/runEventSchema'
import { withRegistrations } from '../../registries/registrar'
import type { DomainEvent } from '../../systems/authority/domainEvent'
import { dockInBay } from '../../systems/authority/scriptedSession'
import { FACING } from '../../systems/vehicle/vehiclePose'
import { FAKE, FAKE_ITEMS, inField } from './fakeItems'
import { slice } from './register'
import { intentToUseSlot } from './systems/slotUse'

// The power-up lines (#162 section 2.4, Systems on #200) as the run log records them, each
// checked against its registered schema.

function linesOf(events: readonly DomainEvent[]) {
  const sink = createMemorySink()
  const runLog = createRunLog({ runId: 'run_200', sink, secondsSinceStart: () => 0 })
  withRegistrations([slice, FAKE_ITEMS], () =>
    recordDomainEventsTo(runLog, { playerId: 'p1', planet: 1, depthTiles: 0 }, events),
  )
  return sink.events.filter((line) => line.event.startsWith('power-up-core.'))
}

const dataOf = (lines: ReturnType<typeof linesOf>) =>
  lines.map(({ event, data }) => ({ event, data }))

function usedAndCancelled(): DomainEvent[] {
  return inField((session) => {
    session.submit(10, intentToUseSlot('powerup.1'))
    session.advanceTo(30)
    session.submit(40, intentToUseSlot('powerup.2'))
    session.submit(50, { type: 'debug.setEnergy', payload: { energy: '37.5' } })
    session.submit(60, { type: 'debug.grantMoney', payload: { amount: '100' } })
    dockInBay(session, 70, 'sell')
    session.submit(71, { type: 'rechargeEnergy', payload: {} })
    return session.events()
  })
}

describe('power-up log lines', () => {
  it('logs a use, a broken channel and a dock refill with the charges after', () => {
    const lines = linesOf(usedAndCancelled())
    expect(dataOf(lines)).toEqual([
      {
        event: 'power-up-core.power_up_used',
        data: {
          itemId: FAKE.charged,
          mark: 0,
          slot: 'powerup.1',
          origin: { tx: expect.any(Number), ty: expect.any(Number) },
          chargesLeft: 1,
        },
      },
      {
        event: 'power-up-core.power_up_cancelled',
        data: { itemId: FAKE.channel, slot: 'powerup.2', chargesLeft: 2 },
      },
      { event: 'power-up-core.charges_refilled', data: { itemId: FAKE.charged, to: 2 } },
    ])
  })

  it('logs a gate refusal with the cell tier and gate kind', () => {
    const events = inField(
      (session) => {
        session.submit(10, intentToUseSlot('powerup.1'))
        session.advanceTo(30)
        return session.events()
      },
      { facing: FACING.down },
    )
    expect(dataOf(linesOf(events))).toEqual([
      {
        event: 'power-up-core.power_up_blocked_by_gate',
        data: {
          itemId: FAKE.charged,
          cellTier: 9,
          gateKind: 'drill_tier',
          tx: expect.any(Number),
          ty: expect.any(Number),
        },
      },
    ])
  })

  it('writes every line to its registered schema', () => {
    const lines = linesOf(usedAndCancelled())
    const problems = withRegistrations([slice, FAKE_ITEMS], () => lines.flatMap(runEventProblems))
    expect(problems).toEqual([])
  })
})
