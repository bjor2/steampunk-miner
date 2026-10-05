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

/** One of each vehicle event (#21), as the authority stamps them. */
const vehicleEvents: DomainEvent[] = [
  { ...commandStamp, type: 'DrillDamageDealt', tx: 20, ty: 298, ticks: 12, damage: '3e-1' },
  { ...commandStamp, type: 'TileDestroyed', tx: 20, ty: 298, kind: 'ore' },
  { ...commandStamp, type: 'CargoAdded', resourceTier: 1, amount: 1, value: '1e+1' },
  { ...commandStamp, type: 'StorageFull', lostUnits: 1 },
  { ...commandStamp, type: 'EnergyLow', threshold: 25 },
  { ...commandStamp, type: 'EnergyDepleted' },
  { ...commandStamp, type: 'VehicleModeChanged', from: 'active', to: 'stranded', reason: 'x' },
  { ...commandStamp, type: 'VehicleDestroyed', cause: 'debug' },
  {
    tick: 300,
    playerId: 'p1',
    type: 'RescueTriggered',
    cause: 'stranded',
    fee: '0e+0',
    cargoLostValue: '1e+1',
  },
  { ...commandStamp, type: 'VehicleConfigurationChanged', visualTier: 2 },
]

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

  it('records every vehicle event as a registered line with no envelope field in its payload', () => {
    recordDomainEvents({ playerId: 'p1', planet: 1, depthTiles: 0 }, vehicleEvents)
    expect(sink.events.map((event) => event.event)).toEqual([
      'drill_damage_dealt',
      'tile_destroyed',
      'resource_collected',
      'storage_full',
      'energy_low',
      'energy_depleted',
      'vehicle_state_changed',
      'vehicle_destroyed',
      'rescue_triggered',
      'vehicle_configuration_changed',
    ])
    expect(sink.events.flatMap(runEventProblems)).toEqual([])
    expect(sink.events.find((event) => event.event === 'energy_low')?.data).toEqual({
      threshold: 25,
    })
  })
})
