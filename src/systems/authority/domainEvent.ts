/**
 * Domain events (decision #3): facts the authority answers a command with, in order. They are
 * the replication unit and the source the run log is projected from (#11), so every field is
 * plain JSON and money is a canonical string.
 */
import type { VehicleMode } from '../vehicle/vehicleState'
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

export type RescueCause = 'stranded' | 'destroyed'

/** Where core fragments came into the bay from (#10). */
export type CoreDepositSource = 'dock' | 'rescue'

/** `SellCargo {resourceTier}` sells one tier, `SellCargo {all}` and the quick action everything. */
export type SaleMode = 'all' | 'single'

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
  TileDestroyed: { tx: number; ty: number; kind: 'ground' | 'ore' | 'core' }
  CargoAdded: { resourceTier: number; amount: number; value: string }
  /** A full hold: the tile still broke, its unit was lost (#7). */
  StorageFull: { lostUnits: number }
  EnergyLow: { threshold: number }
  EnergyDepleted: Record<never, never>
  VehicleModeChanged: { from: VehicleMode; to: VehicleMode; reason: string }
  VehicleDestroyed: { cause: string }
  RescueTriggered: { cause: RescueCause; fee: string; cargoLostValue: string }
  UpgradeLevelChanged: { upgradeId: string; from: number; to: number }
  VehicleConfigurationChanged: { visualTier: number }
  /** Energy in quanta, hull as a canonical string (#11 amendment 2). */
  DockEntered: { cargoUnits: number; energy: number; hull: string }
  DockLeft: { durationTicks: number }
  /** The first core tile of the planet broke (#10). */
  CoreReached: Record<never, never>
  /** One core tile broke; `fragments` is what the hold took (0 when it was full). */
  CoreTileHarvested: { tilesRemaining: number; fragments: number }
  CoreBayDeposited: { fragments: number; total: number; source: CoreDepositSource }
  /** The bay first held `coreNeeded` on this planet, `durationTicks` after `core_reached`. */
  CoreCompleted: { durationTicks: number }
  PlatformConfigurationChanged: { visualState: PlatformVisualState }
  ResourceSold: { items: SoldItem[]; value: string; mode: SaleMode }
  RepairPurchased: { hullFrom: string; hullTo: string; cost: string }
  /** Energy in quanta. */
  EnergyRecharged: { from: number; to: number; cost: string }
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
