import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { DomainEvent } from '../systems/authority/domainEvent'
import { projectDomainEvent, recordDomainEvents } from './domainEventLog'
import { createMemorySink } from './eventSink'
import { createRunLog, installRunLog, uninstallRunLog } from './runLog'
import { runEventProblems } from './runEventSchema'

const commandStamp = { playerId: 'p1', tick: 120, seq: 4 }

const debugApplied: DomainEvent = {
  ...commandStamp,
  type: 'DebugCommandApplied',
  command: 'debug.grantMoney',
  args: { amount: '1e+30' },
}

const rejected: DomainEvent = {
  ...commandStamp,
  type: 'CommandRejected',
  commandType: 'debug.grantMoney',
  reason: 'invalid_payload',
  problems: ['amount must be a decimal string >= 0, got "-1"'],
}

const digested: DomainEvent = {
  tick: 3600,
  type: 'StateDigested',
  digest: '0123456789abcdef',
  scope: 'periodic',
}

describe('domain event projection', () => {
  it('logs an applied debug command with the tick and seq of its command', () => {
    expect(projectDomainEvent(debugApplied)).toEqual({
      tick: 120,
      cmd: [120, 4],
      line: {
        event: 'debug_command_applied',
        data: { command: 'debug.grantMoney', args: { amount: '1e+30' } },
      },
    })
  })

  it('logs a refused command by its type and reason only', () => {
    expect(projectDomainEvent(rejected)?.line).toEqual({
      event: 'command_rejected',
      data: { type: 'debug.grantMoney', reason: 'invalid_payload' },
    })
  })

  it('logs a periodic digest with no cmd, because the clock caused it', () => {
    expect(projectDomainEvent(digested)).toEqual({
      tick: 3600,
      line: { event: 'state_digest', data: { digest: '0123456789abcdef', scope: 'periodic' } },
    })
  })

  it('writes no line for a wallet change, which its debug command already explains', () => {
    const changed: DomainEvent = { ...commandStamp, type: 'MoneyChanged', from: '0e+0', to: '1e+0' }
    expect(projectDomainEvent(changed)).toBeNull()
  })
})

describe('domain event log', () => {
  let sink: ReturnType<typeof createMemorySink>

  beforeEach(() => {
    sink = createMemorySink()
    installRunLog(createRunLog({ runId: 'run_test', sink, secondsSinceStart: () => 1.5 }))
  })

  afterEach(() => uninstallRunLog())

  it('records only lines that pass the schema registry', () => {
    const place = { playerId: 'p1', planet: 1, depthTiles: 12 }
    recordDomainEvents(place, [debugApplied, rejected, digested])
    expect(sink.events.map((event) => event.event)).toEqual([
      'debug_command_applied',
      'command_rejected',
      'state_digest',
    ])
    expect(sink.events.flatMap(runEventProblems)).toEqual([])
  })
})
