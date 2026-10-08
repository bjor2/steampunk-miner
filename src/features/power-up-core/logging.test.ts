import { describe, expect, it } from 'vitest'
import { recordDomainEventsTo } from '../../logging/domainEventLog'
import { createMemorySink } from '../../logging/eventSink'
import { createRunLog } from '../../logging/runLog'
import { runEventProblems } from '../../logging/runEventSchema'
import { withRegistrations } from '../../registries/registrar'
import type { DomainEvent } from '../../systems/authority/domainEvent'
import { dockInBay } from '../../systems/authority/scriptedSession'
import { FACING } from '../../systems/vehicle/vehiclePose'
import { FAKE, FAKE_ITEMS, FAKE_REFUSAL, inField } from './fakeItems'
import { CLAMP, inHoldField } from './fakeHoldItem'
import { DASHER, inMarkedField } from './fakeMilestoneItems'
import { slice } from './register'
import { intentToReleaseSlot, intentToUseSlot } from './systems/slotUse'

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

  it('logs a use with nothing to act on with its reason and the charges kept', () => {
    const events = inField(
      (session) => {
        session.submit(10, intentToUseSlot('powerup.1'))
        session.advanceTo(30)
        return session.events()
      },
      { facing: FACING.up },
    )
    const lines = linesOf(events)
    expect(dataOf(lines)).toEqual([
      {
        event: 'power-up-core.power_up_refused',
        data: { itemId: FAKE.charged, slot: 'powerup.1', reason: FAKE_REFUSAL, chargesLeft: 2 },
      },
    ])
    expect(withRegistrations([slice, FAKE_ITEMS], () => lines.flatMap(runEventProblems))).toEqual(
      [],
    )
  })

  it('names the Mark milestone a follow-up use was on power_up_used (#256)', () => {
    const events = inMarkedField(3, (field) => {
      field.submit(10, intentToUseSlot('powerup.1'))
      field.advanceTo(16)
      field.submit(20, intentToUseSlot('powerup.1'))
      field.advanceTo(30)
      return field.events()
    })
    const lines = linesOf(events)
    expect(dataOf(lines)).toMatchObject([
      { event: 'power-up-core.power_up_used', data: { itemId: DASHER, mark: 3 } },
      {
        event: 'power-up-core.power_up_used',
        data: { itemId: DASHER, mark: 3, milestone: 'second-tap' },
      },
    ])
    expect(lines[0].data).not.toHaveProperty('milestone')
    expect(withRegistrations([slice, FAKE_ITEMS], () => lines.flatMap(runEventProblems))).toEqual(
      [],
    )
  })

  it('logs a slot let go during a hold with the item and the slot (ticket 332)', () => {
    const events = inHoldField((field) => {
      field.submit(10, intentToUseSlot('powerup.1'))
      field.advanceTo(20)
      field.submit(40, intentToReleaseSlot('powerup.1'))
      return field.events()
    })
    const lines = linesOf(events)
    expect(dataOf(lines).at(-1)).toEqual({
      event: 'power-up-core.power_up_released',
      data: { itemId: CLAMP, slot: 'powerup.1' },
    })
    expect(withRegistrations([slice, FAKE_ITEMS], () => lines.flatMap(runEventProblems))).toEqual(
      [],
    )
  })

  it('writes every line to its registered schema', () => {
    const lines = linesOf(usedAndCancelled())
    const problems = withRegistrations([slice, FAKE_ITEMS], () => lines.flatMap(runEventProblems))
    expect(problems).toEqual([])
  })
})
