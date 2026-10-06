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
  // Per-carve chunk changes would swamp the log; the yields above are its record of mining (#4).
  GroundChanged: () => null,
  CasingPlaced: ({ samples, relined, grade }) => ({
    event: 'casing_placed',
    data: { samples, relined, grade },
  }),
  CasingLined: ({ lengthMm, band, grade, price }) => ({
    event: 'casing_lined',
    data: { lengthMm, band, grade, price },
  }),
  // A breach per chunk replicates the gnaw; `ring_gnawed` is its one log line per ring (#111).
  CasingBreached: () => null,
  RingGnawed: ({ ring, band }) => ({ event: 'ring_gnawed', data: { ring, band } }),
  CasingDrilled: ({ samples, grade }) => ({ event: 'casing_drilled', data: { samples, grade } }),
  CasingGradeInsufficient: ({ band, grade, required }) => ({
    event: 'casing_grade_insufficient',
    data: { band, grade, required },
  }),
  CasingGradeSufficient: ({ band, grade }) => ({
    event: 'casing_grade_sufficient',
    data: { band, grade },
  }),
  CollapseWarned: ({ block, band, weakestGrade, required }) => ({
    event: 'collapse_warning',
    data: { block, band, weakestGrade, required },
  }),
  CollapseCancelled: ({ block }) => ({ event: 'collapse_cancelled', data: { block } }),
  CollapseStarted: ({ block, samplesFilled, vehiclesHit }) => ({
    event: 'collapse',
    data: { block, samplesFilled, vehiclesHit },
  }),
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
  WreckerSpawned: ({ enemyId, ring, band }) => ({
    event: 'wrecker_spawned',
    data: { enemyId, ring, band },
  }),
  WreckerFled: ({ enemyId }) => ({ event: 'wrecker_fled', data: { enemyId } }),
  GunHit: ({ enemyId, damage, shots, energy }) => ({
    event: 'gun_hit',
    data: { enemyId, damage, shots, energy },
  }),
  GunMounted: ({ level, price }) => ({ event: 'gun_mounted', data: { level, price } }),
  GunUpgraded: ({ from, to, price }) => ({ event: 'gun_upgraded', data: { from, to, price } }),
  GunModeChanged: ({ mode }) => ({ event: 'gun_mode', data: { mode } }),
  // A collapse's crush has no enemy: its fields read as `vehicle_destroyed` does with none (#43).
  VehicleDamaged: ({ amount, source, arc, enemyId, kind, tier, hullAfter }) => ({
    event: 'vehicle_damaged',
    data: {
      amount,
      source,
      arc: arc ?? 'none',
      enemyId: enemyId ?? '',
      kind: kind ?? 'none',
      tier: tier ?? 0,
      hullAfter,
    },
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
  FeatureUnlocked: ({ featureId }) => ({ event: 'feature_unlocked', data: { featureId } }),
  PlanetEntered: ({ planetSeed, generatorVersion, radius }) => ({
    event: 'planet_entered',
    data: { planetSeed, generatorVersion, radius },
  }),
  ResourceSold: ({ items, value, mode }) => ({
    event: 'resource_sold',
    data: { items, value, mode },
  }),
  LiningSettled: ({ billed, paid, forgiven }) => ({
    event: 'lining_settled',
    data: { billed, paid, forgiven },
  }),
  ArtefactCacheSpawned: ({ tx, ty, band }) => ({
    event: 'artefact_cache_spawned',
    data: { tx, ty, band },
  }),
  ArtefactCacheOpened: ({ tx, ty }) => ({ event: 'artefact_open', data: { tx, ty } }),
  ArtefactChosen: ({ optionId }) => ({ event: 'artefact_chosen', data: { optionId } }),
  ArtefactAssayApplied: ({ tier, band, unitPrice }) => ({
    event: 'artefact_assay_applied',
    data: { tier, band, unitPrice },
  }),
  RefineQueued: ({ slot, tier, units, requestedUnits }) => ({
    event: 'refine_queued',
    data: { slot, tier, units, requestedUnits },
  }),
  RefineReady: ({ slot, tier, units }) => ({ event: 'refine_ready', data: { slot, tier, units } }),
  RefineCollected: (collected) => ({
    event: 'refine_collected',
    data: {
      slot: collected.slot,
      tier: collected.tier,
      units: collected.units,
      rawValue: collected.rawValue,
      value: collected.value,
      waitSeconds: collected.waitSeconds,
      queuedPlanet: collected.queuedPlanet,
    },
  }),
  RefinerySlotBought: ({ slots, price }) => ({
    event: 'refinery_slot_bought',
    data: { slots, price },
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
