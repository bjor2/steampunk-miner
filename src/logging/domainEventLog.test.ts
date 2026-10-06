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
  {
    ...commandStamp,
    type: 'CargoAdded',
    resourceTier: 1,
    amount: 1,
    value: '1e+1',
    oreId: 'kernel.metal.t1',
    depthTiles: 2,
    chunk: '0,9',
  },
  { ...commandStamp, type: 'StorageFull', lostUnits: 1 },
  { ...commandStamp, type: 'EnergyLow', threshold: 25 },
  { ...commandStamp, type: 'EnergyDepleted' },
  { ...commandStamp, type: 'VehicleModeChanged', from: 'active', to: 'stranded', reason: 'x' },
  { ...commandStamp, type: 'VehicleDestroyed', cause: 'debug', attacker: null },
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

const platformEvents: DomainEvent[] = [
  { ...commandStamp, type: 'DockEntered', bay: 'sell', cargoUnits: 4, energy: 9000, hull: '5e+1' },
  { ...commandStamp, type: 'CoreBayDeposited', fragments: 3, total: 63, source: 'dock' },
  { ...commandStamp, type: 'PlatformConfigurationChanged', visualState: 'core_drive' },
  {
    ...commandStamp,
    type: 'ResourceSold',
    items: [{ tier: 1, amount: 4 }],
    value: '4e+1',
    mode: 'all',
  },
  { ...commandStamp, type: 'RepairPurchased', hullFrom: '5e+1', hullTo: '1e+2', cost: '5.625e+0' },
  { ...commandStamp, type: 'EnergyRecharged', from: 9000, to: 36000, cost: '5.063e+0' },
  {
    ...commandStamp,
    type: 'UpgradePurchased',
    upgradeId: 'hull',
    kind: 'vertical',
    fromLevel: 0,
    toLevel: 1,
    cost: '4.8e+1',
    costCurveId: 'cost.vehicle.hull',
    totalLevel: 1,
    visualTier: 1,
    statsAfter: { hullMax: '1.12e+2', energyMax: '1.5e+2' },
  },
  { ...commandStamp, type: 'CasingUpgraded', from: 1, to: 2, price: '4.8e+1' },
  { ...commandStamp, type: 'RefineQueued', slot: 0, tier: 7, units: 5, requestedUnits: 9 },
  { tick: 11000, playerId: 'p1', type: 'RefineReady', slot: 0, tier: 7, units: 5 },
  {
    ...commandStamp,
    type: 'RefineCollected',
    slot: 0,
    tier: 7,
    units: 5,
    rawValue: '5.6953e+2',
    value: '7.11914e+2',
    waitSeconds: 180,
    queuedPlanet: 3,
  },
  { ...commandStamp, type: 'RefinerySlotBought', slots: 2, price: '1.1533008e+4' },
  { ...commandStamp, type: 'DockLeft', bay: 'refinery', durationTicks: 300 },
]

const combatEvents: DomainEvent[] = [
  {
    tick: 400,
    playerId: 'p1',
    type: 'EnemySpawned',
    enemyId: 'e1',
    kind: 'crawler',
    tier: 2,
    spawnPointId: '3,8#0',
  },
  { tick: 400, playerId: 'p1', type: 'EnemyTypeEncountered', kind: 'crawler' },
  {
    tick: 460,
    playerId: 'p1',
    type: 'VehicleDamaged',
    amount: '4.9e+0',
    source: 'drill-contact enemy',
    arc: 'front',
    enemyId: 'e1',
    kind: 'crawler',
    tier: 1,
    hullAfter: '1.2054e+2',
  },
  {
    tick: 490,
    playerId: 'p1',
    type: 'EnemyDamaged',
    enemyId: 'e1',
    amount: '3.27e+0',
    source: 'drill',
    arc: 'front',
    ticks: 30,
  },
  {
    tick: 532,
    playerId: 'p1',
    type: 'EnemyKilled',
    enemyId: 'e1',
    kind: 'crawler',
    tier: 1,
    by: 'drill',
  },
  { tick: 600, playerId: 'p1', type: 'EnemyDespawned', enemyId: 'e2' },
  {
    tick: 700,
    playerId: 'p1',
    type: 'VehicleDestroyed',
    cause: 'enemy',
    attacker: { kind: 'burrower', tier: 9, arc: 'rear' },
  },
]

const collapseEvents: DomainEvent[] = [
  { tick: 600, type: 'CollapseWarned', block: '0,8#17', band: 2, weakestGrade: 1, required: 2 },
  { tick: 610, type: 'CollapseCancelled', block: '0,8#18' },
  { tick: 660, type: 'CollapseStarted', block: '0,8#17', samplesFilled: 96, vehiclesHit: 1 },
  {
    tick: 660,
    playerId: 'p1',
    type: 'VehicleDamaged',
    amount: '8e+0',
    source: 'collapse',
    arc: null,
    enemyId: null,
    kind: null,
    tier: null,
    hullAfter: '9.2e+1',
  },
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

  it('records which ore was collected, how deep its cell lay and its chunk (#122)', () => {
    recordDomainEvents({ playerId: 'p1', planet: 1, depthTiles: 0 }, vehicleEvents)
    expect(sink.events.find((event) => event.event === 'resource_collected')?.data).toEqual({
      resourceTier: 1,
      amount: 1,
      value: '1e+1',
      oreId: 'kernel.metal.t1',
      oreDepthTiles: 2,
      chunk: '0,9',
    })
  })

  it('records every combat event as a registered line; an enemy kill names no enemy id', () => {
    recordDomainEvents({ playerId: 'p1', planet: 1, depthTiles: 0 }, combatEvents)
    expect(sink.events.map((event) => event.event)).toEqual([
      'enemy_spawned',
      'enemy_type_encountered',
      'vehicle_damaged',
      'enemy_damaged',
      'enemy_killed',
      'enemy_despawned',
      'vehicle_destroyed',
    ])
    expect(sink.events.flatMap(runEventProblems)).toEqual([])
    expect(sink.events.find((event) => event.event === 'enemy_killed')?.data).toEqual({
      kind: 'crawler',
      tier: 1,
      by: 'drill',
    })
    expect(sink.events.find((event) => event.event === 'vehicle_destroyed')?.data).toEqual({
      cause: 'enemy',
      kind: 'burrower',
      tier: 9,
      arc: 'rear',
    })
  })

  it('records every collapse event as a registered line; a crush names no enemy', () => {
    recordDomainEvents({ playerId: 'p1', planet: 1, depthTiles: 48 }, collapseEvents)
    expect(sink.events.map((event) => event.event)).toEqual([
      'collapse_warning',
      'collapse_cancelled',
      'collapse',
      'vehicle_damaged',
    ])
    expect(sink.events.flatMap(runEventProblems)).toEqual([])
    expect(sink.events.find((event) => event.event === 'vehicle_damaged')?.data).toEqual({
      amount: '8e+0',
      source: 'collapse',
      arc: 'none',
      enemyId: '',
      kind: 'none',
      tier: 0,
      hullAfter: '9.2e+1',
    })
  })

  it('records every platform event as a registered line with no envelope field in its payload', () => {
    recordDomainEvents({ playerId: 'p1', planet: 1, depthTiles: 0 }, platformEvents)
    expect(sink.events.map((event) => event.event)).toEqual([
      'dock_entered',
      'core_bay_deposited',
      'platform_configuration_changed',
      'resource_sold',
      'repair_purchased',
      'energy_recharged',
      'upgrade_purchased',
      'casing_upgraded',
      'refine_queued',
      'refine_ready',
      'refine_collected',
      'refinery_slot_bought',
      'dock_left',
    ])
    expect(sink.events.flatMap(runEventProblems)).toEqual([])
  })

  it('records equipping and its refusals as registered lines, an empty slot as none (K4)', () => {
    recordDomainEvents({ playerId: 'p1', planet: 1, depthTiles: 0 }, [
      { ...commandStamp, type: 'ItemEquipped', slot: 'powerup.1', itemId: null },
      { ...commandStamp, type: 'ItemEquipped', slot: 'powerup.2', itemId: 'sensing.echo_sounder' },
      {
        ...commandStamp,
        type: 'EquipRefused',
        slot: 'rig.1',
        itemId: 'rig.resonance',
        reason: 'wrong_slot',
      },
    ])
    expect(sink.events.map(({ event, data }) => ({ event, data }))).toEqual([
      { event: 'equip_item', data: { slot: 'powerup.1', itemId: 'none' } },
      { event: 'equip_item', data: { slot: 'powerup.2', itemId: 'sensing.echo_sounder' } },
      {
        event: 'equip_refused',
        data: { slot: 'rig.1', itemId: 'rig.resonance', reason: 'wrong_slot' },
      },
    ])
    expect(sink.events.flatMap(runEventProblems)).toEqual([])
  })
})
