/**
 * The projection from the authority's domain events to run-log lines (decision #11: log events are
 * a projection of domain events, never written ad hoc from game code, so in co-op a client can
 * never log what the host did not accept). Pure mapping first, recording second.
 *
 * Domain events with no log line project to null: planet, seed, wallet and upgrade-level changes so
 * far come from `debug.*` commands (whose `debug_command_applied` line already says what happened)
 * or ride with an event that is logged (a tow's fee is in `rescue_triggered`). Each later ticket
 * adds the projection of the domain events it introduces.
 */
import {
  isCommandCaused,
  type DomainEvent,
  type DomainEventBodies,
  type DomainEventType,
} from '../systems/authority/domainEvent'
import type { RunEventData, RunEventName } from './eventNames'
import type { CommandRef, RunEventPlace, RunEventStamp } from './runEvent'
import { getRunLog, type RunLog } from './runLog'

/** An event name with the payload registered for it. */
export type RunLogLine = { [N in RunEventName]: { event: N; data: RunEventData<N> } }[RunEventName]

export interface ProjectedLine {
  tick: number
  cmd?: CommandRef
  line: RunLogLine
}

type Projection<K extends DomainEventType> = (body: DomainEventBodies[K]) => RunLogLine | null

const PROJECTIONS: { readonly [K in DomainEventType]: Projection<K> } = {
  PlanetChanged: () => null,
  PlanetSeedChanged: () => null,
  MoneyChanged: () => null,
  DebugCommandApplied: ({ command, args }) => ({
    event: 'debug_command_applied',
    data: { command, args },
  }),
  CommandRejected: ({ commandType, reason }) => ({
    event: 'command_rejected',
    data: { type: commandType, reason },
  }),
  StateDigested: ({ digest, scope }) => ({ event: 'state_digest', data: { digest, scope } }),
  DrillDamageDealt: ({ tx, ty, ticks, damage }) => ({
    event: 'drill_damage_dealt',
    data: { tx, ty, ticks, damage },
  }),
  TileDestroyed: ({ tx, ty, kind }) => ({ event: 'tile_destroyed', data: { tx, ty, kind } }),
  CargoAdded: ({ resourceTier, amount, value }) => ({
    event: 'resource_collected',
    data: { resourceTier, amount, value },
  }),
  StorageFull: ({ lostUnits }) => ({ event: 'storage_full', data: { lostUnits } }),
  EnergyLow: ({ threshold }) => ({ event: 'energy_low', data: { threshold } }),
  EnergyDepleted: () => ({ event: 'energy_depleted', data: {} }),
  VehicleModeChanged: ({ from, to, reason }) => ({
    event: 'vehicle_state_changed',
    data: { from, to, reason },
  }),
  // A debug hull destroys with no attacker: no kind, no arc.
  VehicleDestroyed: ({ cause, attacker }) => ({
    event: 'vehicle_destroyed',
    data: {
      cause,
      kind: attacker?.kind ?? 'none',
      tier: attacker?.tier ?? 0,
      arc: attacker?.arc ?? 'none',
    },
  }),
  EnemySpawned: ({ enemyId, kind, tier, spawnPointId }) => ({
    event: 'enemy_spawned',
    data: { enemyId, kind, tier, spawnPointId },
  }),
  EnemyTypeEncountered: ({ kind }) => ({ event: 'enemy_type_encountered', data: { kind } }),
  EnemyDamaged: ({ enemyId, amount, source, arc, ticks }) => ({
    event: 'enemy_damaged',
    data: { enemyId, amount, source, arc, ticks },
  }),
  EnemyKilled: ({ kind, tier, by }) => ({ event: 'enemy_killed', data: { kind, tier, by } }),
  EnemyDespawned: ({ enemyId }) => ({ event: 'enemy_despawned', data: { enemyId } }),
  VehicleDamaged: ({ amount, arc, enemyId, kind, tier, hullAfter }) => ({
    event: 'vehicle_damaged',
    data: { amount, arc, enemyId, kind, tier, hullAfter },
  }),
  RescueTriggered: ({ cause, fee, cargoLostValue }) => ({
    event: 'rescue_triggered',
    data: { cause, fee, cargoLostValue },
  }),
  UpgradeLevelChanged: () => null,
  VehicleConfigurationChanged: ({ visualTier }) => ({
    event: 'vehicle_configuration_changed',
    data: { visualTier },
  }),
  DockEntered: ({ bay, cargoUnits, energy, hull }) => ({
    event: 'dock_entered',
    data: { bay, cargoUnits, energy, hull },
  }),
  DockLeft: ({ bay, durationTicks }) => ({ event: 'dock_left', data: { bay, durationTicks } }),
  CoreReached: () => ({ event: 'core_reached', data: {} }),
  CoreTileHarvested: ({ tilesRemaining, fragments }) => ({
    event: 'core_tile_harvested',
    data: { tilesRemaining, fragments },
  }),
  CoreCompleted: ({ durationTicks }) => ({ event: 'core_completed', data: { durationTicks } }),
  CoreBayDeposited: ({ fragments, total, source }) => ({
    event: 'core_bay_deposited',
    data: { fragments, total, source },
  }),
  PlatformConfigurationChanged: ({ visualState }) => ({
    event: 'platform_configuration_changed',
    data: { visualState },
  }),
  TravelStarted: ({ fromPlanet, toPlanet, cost, coreSpent }) => ({
    event: 'travel_started',
    data: { fromPlanet, toPlanet, cost, coreSpent },
  }),
  PlanetUnlocked: ({ planetIndex }) => ({ event: 'planet_unlocked', data: { planetIndex } }),
  PlanetEntered: ({ planetSeed, generatorVersion, radius }) => ({
    event: 'planet_entered',
    data: { planetSeed, generatorVersion, radius },
  }),
  ResourceSold: ({ items, value, mode }) => ({
    event: 'resource_sold',
    data: { items, value, mode },
  }),
  RepairPurchased: ({ hullFrom, hullTo, cost }) => ({
    event: 'repair_purchased',
    data: { hullFrom, hullTo, cost },
  }),
  EnergyRecharged: ({ from, to, cost }) => ({
    event: 'energy_recharged',
    data: { from, to, cost },
  }),
  CasingUpgraded: ({ from, to, price }) => ({
    event: 'casing_upgraded',
    data: { from, to, price },
  }),
  UpgradePurchased: (purchase) => ({
    event: 'upgrade_purchased',
    data: {
      upgradeId: purchase.upgradeId,
      kind: purchase.kind,
      fromLevel: purchase.fromLevel,
      toLevel: purchase.toLevel,
      cost: purchase.cost,
      costCurveId: purchase.costCurveId,
      totalLevel: purchase.totalLevel,
      visualTier: purchase.visualTier,
      statsAfter: purchase.statsAfter,
    },
  }),
}

export function projectDomainEvent(event: DomainEvent): ProjectedLine | null {
  const line = lineOf(event)
  if (line === null) return null
  return { tick: event.tick, ...causeOf(event), line }
}

function lineOf(event: DomainEvent): RunLogLine | null {
  const project = PROJECTIONS[event.type] as Projection<typeof event.type>
  return project(event as never)
}

function causeOf(event: DomainEvent): { cmd?: CommandRef } {
  return isCommandCaused(event) ? { cmd: [event.tick, event.seq] } : {}
}

export function recordDomainEvents(place: RunEventPlace, events: readonly DomainEvent[]): void {
  recordDomainEventsTo(getRunLog(), place, events)
}

/** The same projection into a run log the caller holds (a headless bot run has its own). */
export function recordDomainEventsTo(
  runLog: RunLog,
  place: RunEventPlace,
  events: readonly DomainEvent[],
): void {
  for (const projected of events.map(projectDomainEvent)) {
    if (projected !== null) recordProjectedLine(runLog, place, projected)
  }
}

function recordProjectedLine(
  runLog: RunLog,
  place: RunEventPlace,
  { tick, cmd, line }: ProjectedLine,
): void {
  const stamp: RunEventStamp = cmd === undefined ? { ...place, tick } : { ...place, tick, cmd }
  // The union pairs each name with its payload; record() checks one name at a time.
  runLog.record(stamp, line.event, line.data as never)
}
