/**
 * Domain events (decision #3): facts the authority answers a command with, in order. They are
 * the replication unit and the source the run log is projected from (#11), so every field is
 * plain JSON and money is a canonical string.
 */
import type { EnemyKind, HitArc } from '../economy/economyDefinition'
import type { GunMode } from '../vehicle/vehicleGun'
import type { VehicleMode } from '../vehicle/vehicleState'
import type { EquipRefusal, LoadoutSlotId } from '../registries/vehicleLoadout'
import type { BayId } from '../world/dockBays'
import type { CommandStamp, CommandType } from './authorityCommand'
import type { PlatformVisualState } from './platformState'

/**
 * Why a command changed nothing (#11 amendment 2: `command_rejected {type, reason}`), one key per
 * reason. An interface, so a slice adds its own reasons by module augmentation, prefixed
 * `<slice>.`, without editing this list (docs/standards/feature-slices.md 3.15):
 *
 *   declare module '<path to>/systems/authority/domainEvent' {
 *     interface RejectionReasons { 'example.bell_cracked': true }
 *   }
 */
export interface RejectionReasons {
  malformed_command: true
  unknown_command: true
  unknown_player: true
  out_of_order: true
  invalid_payload: true
  // Registered by the vehicle commands (#21): the planet is not set up, the vehicle cannot act,
  // the pose is impossible, more action ticks than time passed, the tile is out of reach or not
  // drillable, no tow is due, or a debug value is outside its range.
  no_planet: true
  vehicle_not_active: true
  invalid_pose: true
  too_many_ticks: true
  out_of_reach: true
  not_drillable: true
  no_rescue_needed: true
  unknown_upgrade: true
  out_of_range: true
  // Registered by the platform commands (#23, #33 uses the same codes on disabled buttons): the
  // vehicle is not docked (or, for `dock`, not stationary in the pad zone), the wallet cannot pay,
  // or the facility has nothing to do.
  not_docked: true
  money_short: true
  nothing_to_sell: true
  hull_full: true
  energy_full: true
  nothing_to_service: true
  // Registered by the two bays (#37): the command belongs to the other bay.
  wrong_bay: true
  // Registered by `Travel` (#10): too few fragments in the bay, or not the next planet.
  core_short: true
  not_next_planet: true
  // Registered by combat's debug commands (#25): not an enemy id, or the vehicle already has the
  // most enemies it may have.
  unknown_enemy: true
  enemy_cap: true
  // Registered by the artefact commands (#46): not one of the three option ids, or this cache is
  // not live for this player (they already hold an artefact).
  unknown_artefact: true
  artefact_unavailable: true
  // Registered by the guns (#107): `auto_guns` is not unlocked on this planet, the gun track is at
  // its cap, the vehicle has no guns to switch, or the mode is not `auto` or `off`.
  feature_locked: true
  max_level: true
  no_guns: true
  unknown_mode: true
  // Registered by the Refinery bay (#105): no refinery before its planet, every slot holds a batch,
  // the hold has no ore of that tier (core fragments never refine), the slots are at their
  // maximum, or nothing of this player's is ready to collect.
  refinery_locked: true
  slots_busy: true
  nothing_to_refine: true
  slots_max: true
  nothing_to_collect: true
  // Registered by the charge commands (#109, sizes K8 #218): the charges asked for do not fit the
  // rack's free slots, no charge of that size is carried, the size is not open on this planet, one
  // is already live, or the vehicle faces no wall to plant on (`feature_locked`, `max_level` above).
  rack_full: true
  no_charge_of_size: true
  size_locked: true
  charge_live: true
  no_wall: true
  // Registered by the lining types (#113): not a lining type, already unlocked, or not unlocked yet.
  unknown_lining_type: true
  lining_type_owned: true
  lining_type_not_owned: true
  // Registered by `debug.setVehicleLoadout` (K4): an unknown slot, an item the slot does not take,
  // or one item in two slots. Play's `equipItem` answers refusals as `EquipRefused` instead.
  invalid_loadout: true
  // Registered by hold-to-buy (#180, ticket 226): a held step the wallet can pay that would leave
  // it under the service reserve.
  service_reserve: true
  // Registered by `buyVehicleItem` (ticket 248): no registered item has the id (a vision row is
  // invisible), the vehicle owns it already, its node is not researched, or nobody sells it here.
  unknown_vehicle_item: true
  vehicle_item_owned: true
  not_researched: true
  not_for_sale: true
}

export type RejectionReason = keyof RejectionReasons

export type RescueCause = 'stranded' | 'destroyed'

/** What fired a charge: its fuse running out, or the plunger (#153 amendment 2, #149). */
export type DetonationTrigger = 'fuse' | 'plunger'

/** Why a live charge was lost unfired (#153): docking, a wreck, or its 3600 ticks running out. */
export type DisarmReason = 'dock' | 'wreck' | 'expired'

/** Where core fragments came into the bay from (#10). */
export type CoreDepositSource = 'dock' | 'rescue'

/** `SellCargo {resourceTier}` sells one tier, `SellCargo {all}` and the quick action everything. */
export type SaleMode = 'all' | 'single'

/**
 * What hurt the vehicle (#43 `VehicleDamaged.source`): an enemy's hit, a collapse's crush, its
 * own charge's blast (#109), the heat gauge at its max, or a lava touch (#113).
 */
export type DamageSource = 'drill-contact enemy' | 'collapse' | 'blast' | 'heat' | 'lava'

/** What hurt or killed an enemy: the drill (#9) or a charge's blast (#109). */
export type EnemyDamageSource = 'drill' | 'blast'

/** What dealt an enemy's killing damage (#107 `enemy_killed {by: drill | gun}`, #109 `blast`). */
export type EnemyKiller = 'drill' | 'gun' | 'blast'

/** Who wrecked the vehicle, for `vehicle_destroyed {kind, tier, arc}` (#9). */
export interface Attacker {
  kind: EnemyKind
  tier: number
  arc: HitArc
}

/**
 * What a purchase step says of its hold (#180, ticket 226): `chain` 0 is a click, any other value
 * the hold's id; a held step adds `reserveLeft`, the wallet above the service reserve after it.
 */
export interface PurchaseChainStamp {
  chain: number
  reserveLeft?: string
}

export interface SoldItem {
  tier: number
  amount: number
}

/** The kernel's own domain events: the closed set its projections and rules are written against. */
export interface KernelDomainEventBodies {
  PlanetChanged: { planetIndex: number }
  PlanetSeedChanged: { planetSeed: number }
  MoneyChanged: { from: string; to: string }
  DebugCommandApplied: { command: CommandType; args: Readonly<Record<string, unknown>> }
  /** `chain` names the hold a refused held purchase step belonged to (ticket 226). */
  CommandRejected: {
    commandType: string
    reason: RejectionReason
    problems: string[]
    chain?: number
  }
  StateDigested: { digest: string; scope: DigestScope }
  /** Drill damage one command dealt to one tile, in hardness units (`ticks * D * eff / 60`). */
  DrillDamageDealt: { tx: number; ty: number; ticks: number; damage: string }
  /**
   * A material cell yielded (#36: its 16 density samples fell to half): the first-slice per-tile
   * mining event, same payload, fired once per cell. `cause: 'blast'` marks a live blast's tile,
   * which the run log leaves to the blast's `blast_resolved` line (K6 #189).
   */
  TileDestroyed: { tx: number; ty: number; kind: 'ground' | 'ore' | 'core'; cause?: 'blast' }
  /**
   * A slice's gate check stopped the drill at an ore cell (feature-slices.md 3.6, K2): `refused`
   * or `blocked` (#142's scratch-only cell) once per drill command that met the cell, `lost`
   * beside the cell's `TileDestroyed`. The fields are the ore and the verdict, as #142's
   * `gate_hit` logs them.
   */
  DrillGated: {
    tx: number
    ty: number
    oreId: string
    family: string
    tier: number
    gateKind: string
    outcome: 'refused' | 'blocked' | 'lost'
    required: string
    have: string
  }
  /**
   * A tool read an ore cell without breaking it (#243, from the #205 lock Q2): the sampling corer's
   * plug. The cell and the hold are unchanged; the codex hears it as contact. It names its player,
   * since a wind-up resolves on the clock, whose stamp carries none.
   */
  OreSampled: { playerId: string; tx: number; ty: number; oreId: string; via: SampleRoute }
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
   * A ring's first-placed lining charged (#76): `lengthMm` of new lining in `liningType` (#113)
   * against the wall's `band`, its canonical `price` added to the vehicle's lining bill (paid at the
   * next sale, #115).
   */
  CasingLined: { lengthMm: number; band: number; grade: number; liningType: string; price: string }
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
  /**
   * One ore unit reached the hold: its tier and sale value, and which ore it was (#122): the
   * `oreId` #155 names, whole tiles below the surface of the cell's column, and the cell's chunk
   * as `cx,cy`, so the log can replay the mined order. A slice's ore catalogue adds the ore's
   * `family` and whether it is a `signature` ore (#140, #141, #223); the kernel default names
   * neither, so older lines still read.
   */
  CargoAdded: {
    resourceTier: number
    amount: number
    value: string
    oreId: string
    family?: string
    signature?: boolean
    depthTiles: number
    chunk: string
  }
  /** A full hold: the tile still broke, its unit was lost (#7). */
  StorageFull: { lostUnits: number }
  EnergyLow: { threshold: number }
  /** The heat gauge rose past a line it watches, in gauge points (#113: the throttle line, the max). */
  HeatThreshold: { level: number }
  /** The vehicle touched the lava of cell `tx, ty` and was burnt (#113 `lava_contact`). */
  LavaTouched: { tx: number; ty: number }
  /** Loose lava stopped at a cell its lining type guards; `ring` is that cell's centre in mm. */
  LavaBlocked: { ring: string }
  /** The vehicle drove from outside every magnetic field into one (spec #258, ticket 290). */
  MagneticFieldEntered: { planetIndex: number }
  /**
   * The drill broke the electrified cell `tx, ty` (spec #258, ticket 290): the shock cost `ticks`
   * more drilling and `hullBp` of the planet's on-curve hull, or nothing when the dielectric bit
   * shielded the cut (`withBit`).
   */
  ElectrifiedCellShocked: {
    tx: number
    ty: number
    ticks: number
    hullBp: number
    withBit: boolean
  }
  /** The gauge rose past `throttleAt`: the drill is throttled until it falls back below (#113). */
  OverheatStarted: Record<never, never>
  OverheatEnded: Record<never, never>
  EnergyDepleted: Record<never, never>
  VehicleModeChanged: { from: VehicleMode; to: VehicleMode; reason: string }
  /** `attacker` is null when no enemy did it (a debug hull). */
  VehicleDestroyed: { cause: string; attacker: Attacker | null }
  /** Combat (#9, #25); the enemy's id is `e1`, `e2`, ... and its spawn point `cx,cy#slot`. */
  EnemySpawned: { enemyId: string; kind: EnemyKind; tier: number; spawnPointId: string }
  /** The first enemy of a kind this run (#9, #14 horizontal coverage). */
  EnemyTypeEncountered: { kind: EnemyKind }
  /**
   * Drill damage on an enemy, summed over at most 30 ticks (#9), or a blast's hit at once, which
   * comes from no arc and over no ticks (#109).
   */
  EnemyDamaged: {
    enemyId: string
    amount: string
    source: EnemyDamageSource
    arc: HitArc | null
    ticks: number
  }
  EnemyKilled: { enemyId: string; kind: EnemyKind; tier: number; by: EnemyKiller }
  /**
   * The guns' hits on one enemy since the shooter's last pose report (#107: counted per report,
   * not one event a shot): their damage, how many shots and the energy they took, in quanta.
   */
  GunHit: { enemyId: string; damage: string; shots: number; energy: number }
  /** The guns were bought and bolted on at level 1 (#107); `price` as a canonical string. */
  GunMounted: PurchaseChainStamp & { level: number; price: string }
  /** One gun level bought (#107). */
  GunUpgraded: PurchaseChainStamp & { from: number; to: number; price: string }
  /** The HUD toggle (#107). */
  GunModeChanged: { mode: GunMode }
  /** A lining type unlocked at the Upgrade bay (#113); `price` as a canonical string. */
  LiningTypeUnlocked: { liningType: string; price: string }
  /** The rings laid from now on use this lining type (#113 `lining_type_selected`). */
  LiningTypeSelected: { liningType: string }
  /**
   * One loadout slot now holds `itemId`, or nothing when null (#162 `equip_item`). An item moved
   * from another slot first empties that slot, as its own event.
   */
  ItemEquipped: { slot: LoadoutSlotId; itemId: string | null }
  /** `equipItem` changed nothing (#162 `equip_refused`); `slot` as sent, so `rig.1` shows as is. */
  EquipRefused: { slot: string; itemId: string | null; reason: EquipRefusal }
  /** A tech-unlocked vehicle item bought at the Upgrade bay (ticket 248); `price` canonical. */
  VehicleItemPurchased: { itemId: string; price: string }
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
  /**
   * `value` is the gross sale, before any lining bill; `coinsShown` is the sell burst's coin count
   * for it (`sellCoins.ts`, ticket 220).
   */
  ResourceSold: { items: SoldItem[]; value: string; mode: SaleMode; coinsShown: number }
  /**
   * The lining bill settled out of a sale (#76 amendment, #115): `paid` is at most the sale's
   * value, so there is never debt, and `forgiven` is the rest of `billed`. Canonical strings.
   */
  LiningSettled: { billed: string; paid: string; forgiven: string }
  /** The planet's artefact cache tile and band (#46), said once per planet entered. */
  ArtefactCacheSpawned: { tx: number; ty: number; band: number }
  /** `interact` opened the live cache's choice (#46); the choice itself is client UI. */
  ArtefactCacheOpened: { tx: number; ty: number }
  /** The pick committed: exactly once per player in the slice (#46). */
  ArtefactChosen: { optionId: string }
  /** `assay_beacon` priced one sold tier at the mid-band unit price (#46). */
  ArtefactAssayApplied: { tier: number; band: number; unitPrice: string }
  /**
   * The Refinery bay (#105): a batch queued into `slot` (`units` after the clamp to the hold and
   * half its capacity, `requestedUnits` as asked), ready on the clock for its owner, and collected
   * at the Sell bay: what it pays, what the ore would have sold for raw, how long its money
   * waited, and the planet it was queued on. A slot bought raises the refinery to `slots`.
   */
  RefineQueued: { slot: number; tier: number; units: number; requestedUnits: number }
  RefineReady: { slot: number; tier: number; units: number }
  RefineCollected: {
    slot: number
    tier: number
    units: number
    rawValue: string
    value: string
    waitSeconds: number
    queuedPlanet: number
  }
  RefinerySlotBought: { slots: number; price: string }
  RepairPurchased: { hullFrom: string; hullTo: string; cost: string }
  /** Energy in quanta. */
  EnergyRecharged: { from: number; to: number; cost: string }
  /**
   * A charge of `size` on the wall at tile `tx, ty`, blowing at `detonateTick`, or null for a remote
   * charge only the plunger fires (K8 #218); `carried` is what the rack holds after, of any size.
   */
  ChargePlanted: {
    tx: number
    ty: number
    size: number
    detonateTick: number | null
    carried: number
  }
  /**
   * The charge at `tx, ty` blew (#109): its hits land now, its ground breaks as a live blast that
   * `BlastResolved` sums up (K6 #189). `size` is its rung on the dynamite ladder and `radiusMm`
   * its blast's radius, both copied from the `BlastEvent` (K3 #186, #213). The radius is a render
   * hint for the flash, shake and thump; balance keys off `size`, never the radius. `by` says
   * whether its fuse ran out or the plunger fired it (#153 amendment 2; the plunger is #149's).
   */
  ChargeDetonated: {
    tx: number
    ty: number
    size: number
    radiusMm?: number
    by: DetonationTrigger
  }
  /** A live charge lost unfired (#153): the planter docked or was wrecked, or it timed out. */
  ChargeDisarmed: { tx: number; ty: number; size: number; reason: DisarmReason }
  /**
   * A live blast's slice this tick (K6 #189): the ring of its front from the first tile it looked
   * at to the last, in mm from the charge tile's centre. Presentation only; the run log skips it.
   */
  BlastFront: { tx: number; ty: number; rInnerMm: number; rOuterMm: number }
  /**
   * A live blast finished (#154, K6 #189): the tiles it cleared, the ore units it sent to the hold
   * and the sale value of the ore it broke and lost, the rim blocks it checked and the collapse
   * warnings they started, and the ticks it was live, its detonation tick included.
   */
  BlastResolved: {
    tx: number
    ty: number
    radiusMm: number
    size: number
    tilesCleared: number
    oreUnits: number
    oreValueLost: string
    collapseChecks: number
    collapsesTriggered: number
    ticks: number
  }
  /** `count` charges of `size` bought into the rack for `price` (#109, sizes K8 #218). */
  ChargesRestocked: { size: number; count: number; price: string }
  /** One rack slot bought: slot level `from` to `to`, for `price` (#109). */
  ChargeRackUpgraded: PurchaseChainStamp & { from: number; to: number; price: string }
  /** One casing grade bought (#41): `price` as a canonical string. */
  CasingUpgraded: PurchaseChainStamp & { from: number; to: number; price: string }
  UpgradePurchased: PurchaseChainStamp & {
    upgradeId: string
    kind: 'vertical'
    /** The stored steps before and after (#180: `10L + k`); the majors are derived beside them. */
    fromLevel: number
    toLevel: number
    fromMajor: number
    toMajor: number
    /** Whether this step was the big level-up. */
    isMajor: boolean
    cost: string
    costCurveId: string
    totalLevel: number
    visualTier: number
    /** `computeVehicleStats` at the new levels, each stat as a canonical string (#7, #11). */
    statsAfter: Readonly<Record<string, string>>
  }
}

/**
 * What sampled an ore cell (#243): the drill-gear corer, or the sensing assay lens once an
 * authority-side emitter reads it (the #203 key map on #243).
 */
export type SampleRoute = 'corer' | 'lens'

/** When a digest is taken (#11 section 3): every 3600 ticks, at docks and travel, at the end. */
export type DigestScope = 'periodic' | 'dock' | 'travel' | 'end'

/**
 * Every domain event, the kernel's and the slices'. A slice adds its events by module augmentation,
 * each type prefixed `<slice>.`, and registers their run-log projections
 * (docs/standards/feature-slices.md 3.15):
 *
 *   declare module '<path to>/systems/authority/domainEvent' {
 *     interface DomainEventBodies { 'example.BellRung': { strokes: number } }
 *   }
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- the slices' augmentation point
export interface DomainEventBodies extends KernelDomainEventBodies {}

export type KernelDomainEventType = keyof KernelDomainEventBodies

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
