/**
 * Domain events (decision #3): facts the authority answers a command with, in order. They are
 * the replication unit and the source the run log is projected from (#11), so every field is
 * plain JSON and money is a canonical string.
 */
import type { EnemyKind, HitArc } from '../economy/economyDefinition'
import type { GunMode } from '../vehicle/vehicleGun'
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
  // Registered by the artefact commands (#46): not one of the three option ids, or this cache is
  // not live for this player (they already hold an artefact).
  | 'unknown_artefact'
  | 'artefact_unavailable'
  // Registered by the guns (#107): `auto_guns` is not unlocked on this planet, the gun track is at
  // its cap, the vehicle has no guns to switch, or the mode is not `auto` or `off`.
  | 'feature_locked'
  | 'max_level'
  | 'no_guns'
  | 'unknown_mode'

export type RescueCause = 'stranded' | 'destroyed'

/** Where core fragments came into the bay from (#10). */
export type CoreDepositSource = 'dock' | 'rescue'

/** `SellCargo {resourceTier}` sells one tier, `SellCargo {all}` and the quick action everything. */
export type SaleMode = 'all' | 'single'

/** What hurt the vehicle (#43 `VehicleDamaged.source`): an enemy's hit, or a collapse's crush. */
export type DamageSource = 'drill-contact enemy' | 'collapse'

/** What dealt an enemy's killing damage (#107: `enemy_killed {by: drill | gun}`). */
export type EnemyKiller = 'drill' | 'gun'

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
  /** One ring of lining (#41): air samples lined and lower-grade casing raised, at `grade`. */
  CasingPlaced: { samples: number; relined: number; grade: number }
  /**
   * A ring's first-placed lining charged (#76): `lengthMm` of new lining against the wall's
   * `band`, `price` owed and `paid` (less when the wallet ran short), both canonical strings.
   */
  CasingLined: { lengthMm: number; band: number; grade: number; price: string; paid: string }
  /** The vehicle entered a band (6: the core) its casing grade does not hold (#41). */
  CasingGradeInsufficient: { band: number; grade: number; required: number }
  /** The vehicle is back where its casing grade holds (#41). */
  CasingGradeSufficient: { band: number; grade: number }
  /**
   * A ring of lining gnawed (#111): `samples` of chunk `cx,cy` turned breached, by the tunnel
   * wrecker `enemyId` (null for `debug.gnawCasing`). Guests learn of the breach from this.
   */
  CasingBreached: { chunk: string; samples: number; enemyId: string | null }
  /** The same gnaw once per ring: its axis point `x,y` in mm and the deepest band of its wall. */
  RingGnawed: { ring: string; band: number }
  /** The drill cleared lining (#41): casing samples drilled to air, the highest grade among them. */
  CasingDrilled: { samples: number; grade: number }
  /**
   * Collapse (#43): a weak block near a vehicle starts its 60-tick telegraph, naming the weakest
   * lining's grade and the band it sits in; guests learn of a collapse from this, then from the
   * refill's ordinary `GroundChanged`.
   */
  CollapseWarned: { block: string; band: number; weakestGrade: number; required: number }
  /** The block stopped being weak, or no vehicle is within 16 m any more, before its refill. */
  CollapseCancelled: { block: string }
  /** The refill starts: the samples it will fill and the vehicles it crushes. */
  CollapseStarted: { block: string; samplesFilled: number; vehiclesHit: number }
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
  EnemyKilled: { enemyId: string; kind: EnemyKind; tier: number; by: EnemyKiller }
  /**
   * The guns' hits on one enemy since the shooter's last pose report (#107: counted per report,
   * not one event a shot): their damage, how many shots and the energy they took, in quanta.
   */
  GunHit: { enemyId: string; damage: string; shots: number; energy: number }
  /** The guns were bought and bolted on at level 1 (#107); `price` as a canonical string. */
  GunMounted: { level: number; price: string }
  /** One gun level bought (#107). */
  GunUpgraded: { from: number; to: number; price: string }
  /** The HUD toggle (#107). */
  GunModeChanged: { mode: GunMode }
  EnemyDespawned: { enemyId: string }
  /** A tunnel wrecker came out of the rock at ring `x,y` (mm) of a vehicle's route, in `band` (#111). */
  WreckerSpawned: { enemyId: string; ring: string; band: number }
  /** A tunnel wrecker got out of every vehicle's sight and went into the rock (#111). */
  WreckerFled: { enemyId: string }
  /** The enemy's id, kind, tier and arc are null when a collapse crushed the vehicle (#43). */
  VehicleDamaged: {
    amount: string
    source: DamageSource
    arc: HitArc | null
    enemyId: string | null
    kind: EnemyKind | null
    tier: number | null
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
  /** A locked-schedule row opened by arriving at its planet (#88), keyed by its #79 row id. */
  FeatureUnlocked: { featureId: string }
  PlanetEntered: { planetSeed: number; generatorVersion: number; radius: number }
  ResourceSold: { items: SoldItem[]; value: string; mode: SaleMode }
  /** The planet's artefact cache tile and band (#46), said once per planet entered. */
  ArtefactCacheSpawned: { tx: number; ty: number; band: number }
  /** `interact` opened the live cache's choice (#46); the choice itself is client UI. */
  ArtefactCacheOpened: { tx: number; ty: number }
  /** The pick committed: exactly once per player in the slice (#46). */
  ArtefactChosen: { optionId: string }
  /** `assay_beacon` priced one sold tier at the mid-band unit price (#46). */
  ArtefactAssayApplied: { tier: number; band: number; unitPrice: string }
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
