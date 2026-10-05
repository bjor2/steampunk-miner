/**
 * Domain events (decision #3): facts the authority answers a command with, in order. They are
 * the replication unit and the source the run log is projected from (#11), so every field is
 * plain JSON and money is a canonical string.
 */
import type { EnemyKind, HitArc } from '../economy/economyDefinition'
import type { VehicleMode } from '../vehicle/vehicleState'
import type { BayId } from '../world/dockBays'
import type { CommandStamp, CommandType } from './authorityCommand'
import type { PlatformVisualState } from './platformState'

/** Why a command changed nothing (#11 amendment 2: `command_rejected {type, reason}`). */
export type RejectionReason =
  | 'malformed_command'
  | 'unknown_command'
  | 'unknown_player'
  | 'out_of_order'
  | 'invalid_payload'
  // Registered by the vehicle commands (#21): the planet is not set up, the vehicle cannot act,
  // the pose is impossible, more action ticks than time passed, the tile is out of reach or not
  // drillable, no tow is due, or a debug value is outside its range.
  | 'no_planet'
  | 'vehicle_not_active'
  | 'invalid_pose'
  | 'too_many_ticks'
  | 'out_of_reach'
  | 'not_drillable'
  | 'no_rescue_needed'
  | 'unknown_upgrade'
  | 'out_of_range'
  // Registered by the platform commands (#23, #33 uses the same codes on disabled buttons): the
  // vehicle is not docked (or, for `dock`, not stationary in the pad zone), the wallet cannot pay,
  // or the facility has nothing to do.
  | 'not_docked'
  | 'money_short'
  | 'nothing_to_sell'
  | 'hull_full'
  | 'energy_full'
  | 'nothing_to_service'
  // Registered by the two bays (#37): the command belongs to the other bay.
  | 'wrong_bay'
  // Registered by `Travel` (#10): too few fragments in the bay, or not the next planet.
  | 'core_short'
  | 'not_next_planet'
  // Registered by combat's debug commands (#25): not an enemy id, or the vehicle already has the
  // most enemies it may have.
  | 'unknown_enemy'
  | 'enemy_cap'

export type RescueCause = 'stranded' | 'destroyed'

/** Where core fragments came into the bay from (#10). */
export type CoreDepositSource = 'dock' | 'rescue'

/** `SellCargo {resourceTier}` sells one tier, `SellCargo {all}` and the quick action everything. */
export type SaleMode = 'all' | 'single'

/** Who wrecked the vehicle, for `vehicle_destroyed {kind, tier, arc}` (#9). */
export interface Attacker {
  kind: EnemyKind
  tier: number
  arc: HitArc
}

export interface SoldItem {
  tier: number
  amount: number
}

export interface DomainEventBodies {
  PlanetChanged: { planetIndex: number }
  PlanetSeedChanged: { planetSeed: number }
  MoneyChanged: { from: string; to: string }
  DebugCommandApplied: { command: CommandType; args: Readonly<Record<string, unknown>> }
  CommandRejected: { commandType: string; reason: RejectionReason; problems: string[] }
  StateDigested: { digest: string; scope: DigestScope }
  /** Drill damage one command dealt to one tile, in hardness units (`ticks * D * eff / 60`). */
  DrillDamageDealt: { tx: number; ty: number; ticks: number; damage: string }
  /**
   * A material cell yielded (#36: its 16 density samples fell to half): the first-slice per-tile
   * mining event, same payload, fired once per cell.
   */
  TileDestroyed: { tx: number; ty: number; kind: 'ground' | 'ore' | 'core' }
  /**
   * The density of one chunk changed (#36, replacing the first slice's tile change): the dirty
   * rectangle in chunk-local samples, inclusive, and the chunk's version after the change. The
   * renderer, the collider halo and later the network consume it; the run log does not.
   */
  GroundChanged: {
    cx: number
    cy: number
    x0: number
    y0: number
    x1: number
    y1: number
    version: number
  }
  CargoAdded: { resourceTier: number; amount: number; value: string }
  /** A full hold: the tile still broke, its unit was lost (#7). */
  StorageFull: { lostUnits: number }
  EnergyLow: { threshold: number }
  EnergyDepleted: Record<never, never>
  VehicleModeChanged: { from: VehicleMode; to: VehicleMode; reason: string }
  /** `attacker` is null when no enemy did it (a debug hull). */
  VehicleDestroyed: { cause: string; attacker: Attacker | null }
  /** Combat (#9, #25); the enemy's id is `e1`, `e2`, ... and its spawn point `cx,cy#slot`. */
  EnemySpawned: { enemyId: string; kind: EnemyKind; tier: number; spawnPointId: string }
  /** The first enemy of a kind this run (#9, #14 horizontal coverage). */
  EnemyTypeEncountered: { kind: EnemyKind }
  /** Drill damage on an enemy, summed over at most 30 ticks (#9). */
  EnemyDamaged: { enemyId: string; amount: string; source: 'drill'; arc: HitArc; ticks: number }
  EnemyKilled: { enemyId: string; kind: EnemyKind; tier: number; by: 'drill' }
  EnemyDespawned: { enemyId: string }
  VehicleDamaged: {
    amount: string
    arc: HitArc
    enemyId: string
    kind: EnemyKind
    tier: number
    hullAfter: string
  }
  RescueTriggered: { cause: RescueCause; fee: string; cargoLostValue: string }
  UpgradeLevelChanged: { upgradeId: string; from: number; to: number }
  VehicleConfigurationChanged: { visualTier: number }
  /** Energy in quanta, hull as a canonical string (#11 amendment 2). */
  DockEntered: { bay: BayId; cargoUnits: number; energy: number; hull: string }
  DockLeft: { bay: BayId; durationTicks: number }
  /** The first core tile of the planet broke (#10). */
  CoreReached: Record<never, never>
  /** One core tile broke; `fragments` is what the hold took (0 when it was full). */
  CoreTileHarvested: { tilesRemaining: number; fragments: number }
  CoreBayDeposited: { fragments: number; total: number; source: CoreDepositSource }
  /** The bay first held `coreNeeded` on this planet, `durationTicks` after `core_reached`. */
  CoreCompleted: { durationTicks: number }
  PlatformConfigurationChanged: { visualState: PlatformVisualState }
  TravelStarted: {
    fromPlanet: number
    toPlanet: number
    cost: string
    coreSpent: number
  }
  PlanetUnlocked: { planetIndex: number }
  PlanetEntered: { planetSeed: number; generatorVersion: number; radius: number }
  ResourceSold: { items: SoldItem[]; value: string; mode: SaleMode }
  RepairPurchased: { hullFrom: string; hullTo: string; cost: string }
  /** Energy in quanta. */
  EnergyRecharged: { from: number; to: number; cost: string }
  /** One casing grade bought (#41): `price` as a canonical string. */
  CasingUpgraded: { from: number; to: number; price: string }
  UpgradePurchased: {
    upgradeId: string
    kind: 'vertical'
    fromLevel: number
    toLevel: number
    cost: string
    costCurveId: string
    totalLevel: number
    visualTier: number
    /** `computeVehicleStats` at the new levels, each stat as a canonical string (#7, #11). */
    statsAfter: Readonly<Record<string, string>>
  }
}

/** When a digest is taken (#11 section 3): every 3600 ticks, at docks and travel, at the end. */
export type DigestScope = 'periodic' | 'dock' | 'travel' | 'end'

export type DomainEventType = keyof DomainEventBodies

export type DomainEventBody = {
  [K in DomainEventType]: { type: K } & DomainEventBodies[K]
}[DomainEventType]

/**
 * An event the clock caused, not a command (a periodic digest, a tow when the grace runs out): it
 * has no seq, and a player only when it happened to one player's vehicle.
 */
export interface TickStamp {
  tick: number
  playerId?: string
  seq?: undefined
}

/**
 * A command-caused event carries the `playerId`, `tick` and `seq` of its command; a tick-driven
 * one only the tick (#11: its log line has no `cmd`).
 */
export type DomainEvent = (CommandStamp | TickStamp) & DomainEventBody

export function isCommandCaused(event: DomainEvent): event is CommandStamp & DomainEventBody {
  return event.seq !== undefined
}
