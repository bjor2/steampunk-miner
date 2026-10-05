/**
 * The schema registry of run events: every event name the game may log, its group, its level and
 * its payload fields (decision #11 section 2, with its two amendments folding in #7, #8 and #9).
 *
 * - `core` events are always on, `detail` and `perf` only in dev, scenario and debug runs.
 * - A payload of `'unspecified'` means the owning ticket has not fixed its fields yet: such an
 *   event may be emitted in dev builds only, and the registry spec fails if slice code emits one.
 * - `'reserved'` names (multiplayer from design doc section 22, and `player_killed`) are never
 *   emitted in the slice.
 * - No payload field repeats an envelope field: the envelope already carries `planet`,
 *   `depthTiles` and `tick`.
 *
 * Adding a name or an optional field keeps `LOG_SCHEMA_VERSION`; renaming, removing or retyping a
 * field bumps it (#11 section 1, versioning).
 */
import type { FieldKind, PayloadFields, PayloadOf } from './eventFields'

export type RunEventLevel = 'core' | 'detail' | 'perf'

export type RunEventGroup =
  'run' | 'progression' | 'platform' | 'mining' | 'vehicle_and_combat' | 'multiplayer'

export type RegisteredEvent =
  | { group: RunEventGroup; level: RunEventLevel; payload: PayloadFields | 'unspecified' }
  | { group: RunEventGroup; payload: 'reserved' }

const ENEMY_KIND = { oneOf: ['crawler', 'burrower'] } as const satisfies FieldKind
const HIT_ARC = { oneOf: ['front', 'side', 'rear'] } as const satisfies FieldKind
const BAY = { oneOf: ['sell', 'upgrade'] } as const satisfies FieldKind

export const RUN_EVENT_REGISTRY = {
  // Run
  game_started: {
    group: 'run',
    level: 'core',
    payload: {
      gameVersion: 'text',
      buildCommit: 'text',
      platform: { oneOf: ['electron', 'browser'] },
      debug: 'flag',
    },
  },
  game_ended: { group: 'run', level: 'core', payload: { reason: 'text' } },
  state_digest: {
    group: 'run',
    level: 'core',
    payload: { digest: 'text', scope: { oneOf: ['periodic', 'dock', 'travel', 'end'] } },
  },
  debug_command_applied: {
    group: 'run',
    level: 'core',
    payload: { command: 'text', args: 'jsonArgs' },
  },
  command_rejected: { group: 'run', level: 'detail', payload: { type: 'text', reason: 'text' } },
  // #58: an onboarding hint went up, once per id; presentation, never part of the digest.
  hint_shown: { group: 'run', level: 'core', payload: { hintId: 'text' } },
  perf_sample: {
    group: 'run',
    level: 'perf',
    payload: {
      frameMsP95: 'float',
      terrainMsP95: 'float',
      colliders: 'integer',
      drawCalls: 'integer',
      chunksLoaded: 'integer',
    },
  },

  // Progression
  planet_entered: {
    group: 'progression',
    level: 'core',
    payload: { planetSeed: 'integer', generatorVersion: 'integer', radius: 'integer' },
  },
  // The unlocked planet by index: the envelope's `planet` is whichever planet the line was on.
  planet_unlocked: { group: 'progression', level: 'core', payload: { planetIndex: 'integer' } },
  // The envelope's `planet` says which core (#10); nothing else to carry.
  core_reached: { group: 'progression', level: 'core', payload: {} },
  core_tile_harvested: {
    group: 'progression',
    level: 'core',
    payload: { tilesRemaining: 'integer', fragments: 'integer' },
  },
  core_completed: { group: 'progression', level: 'core', payload: { durationTicks: 'integer' } },
  travel_started: {
    group: 'progression',
    level: 'core',
    payload: { fromPlanet: 'integer', toPlanet: 'integer', cost: 'money', coreSpent: 'integer' },
  },
  feature_unlocked: { group: 'progression', level: 'core', payload: 'unspecified' },

  // Platform (#8); energy is an integer count of quanta (#11 amendment 2), hull a BigStat. The
  // dock events carry the bay (#37).
  dock_entered: {
    group: 'platform',
    level: 'core',
    payload: { bay: BAY, cargoUnits: 'integer', energy: 'integer', hull: 'money' },
  },
  dock_left: { group: 'platform', level: 'core', payload: { bay: BAY, durationTicks: 'integer' } },
  resource_sold: {
    group: 'platform',
    level: 'core',
    payload: {
      items: { listOf: { tier: 'integer', amount: 'integer' } },
      value: 'money',
      mode: { oneOf: ['all', 'single'] },
    },
  },
  energy_recharged: {
    group: 'platform',
    level: 'core',
    payload: { from: 'integer', to: 'integer', cost: 'money' },
  },
  repair_purchased: {
    group: 'platform',
    level: 'core',
    payload: { hullFrom: 'money', hullTo: 'money', cost: 'money' },
  },
  upgrade_purchased: {
    group: 'platform',
    level: 'core',
    payload: {
      upgradeId: 'text',
      fromLevel: 'integer',
      toLevel: 'integer',
      cost: 'money',
      kind: 'text',
      costCurveId: 'text',
      totalLevel: 'integer',
      visualTier: 'integer',
      statsAfter: { mapOf: 'money' },
    },
  },
  // #41: one casing grade bought at the Upgrade bay.
  casing_upgraded: {
    group: 'platform',
    level: 'core',
    payload: { from: 'integer', to: 'integer', price: 'money' },
  },
  purchase_made: { group: 'platform', level: 'core', payload: 'unspecified' },
  rescue_triggered: {
    group: 'platform',
    level: 'core',
    payload: {
      cause: { oneOf: ['destroyed', 'stranded'] },
      fee: 'money',
      cargoLostValue: 'money',
    },
  },
  checkpoint_saved: {
    group: 'platform',
    level: 'core',
    payload: { slot: 'text', epoch: 'integer', bytes: 'integer', digest: 'text' },
  },
  // #26: the run resumed from a checkpoint; its commands replay from this state, not the seed.
  checkpoint_loaded: {
    group: 'platform',
    level: 'core',
    payload: { slot: 'text', epoch: 'integer', digest: 'text' },
  },
  core_bay_deposited: {
    group: 'platform',
    level: 'core',
    payload: { fragments: 'integer', total: 'integer', source: { oneOf: ['dock', 'rescue'] } },
  },
  platform_configuration_changed: {
    group: 'platform',
    level: 'core',
    payload: { visualState: { oneOf: ['outpost', 'core_drive'] } },
  },

  // Mining
  mining_session_started: { group: 'mining', level: 'core', payload: {} },
  mining_session_ended: {
    group: 'mining',
    level: 'core',
    payload: {
      maxDepthTiles: 'integer',
      tilesDestroyed: 'integer',
      cargoValue: 'money',
      damageTaken: 'money',
      durationTicks: 'integer',
    },
  },
  mining_interval: {
    group: 'mining',
    level: 'core',
    payload: {
      tilesDestroyed: 'integer',
      collected: { listOf: { tier: 'integer', amount: 'integer', value: 'money' } },
      drillDamageDealt: 'money',
    },
  },
  depth_band_entered: { group: 'mining', level: 'core', payload: { band: 'integer' } },
  storage_full: { group: 'mining', level: 'core', payload: { lostUnits: 'integer' } },
  energy_depleted: { group: 'mining', level: 'core', payload: {} },
  energy_low: { group: 'mining', level: 'core', payload: { threshold: 'integer' } },
  rare_resource_discovered: { group: 'mining', level: 'core', payload: 'unspecified' },
  tile_drilled: { group: 'mining', level: 'detail', payload: 'unspecified' },
  tile_destroyed: {
    group: 'mining',
    level: 'detail',
    payload: { tx: 'integer', ty: 'integer', kind: { oneOf: ['ground', 'ore', 'core'] } },
  },
  // One line per drilling command (a pose report's interval or a `drillTile`), #7: `damage` is
  // `ticks * drillPower * eff / 60` in hardness units.
  drill_damage_dealt: {
    group: 'mining',
    level: 'detail',
    payload: { tx: 'integer', ty: 'integer', ticks: 'integer', damage: 'money' },
  },
  resource_collected: {
    group: 'mining',
    level: 'detail',
    payload: { resourceTier: 'integer', amount: 'integer', value: 'money' },
  },

  // Vehicle and combat (#7, #9)
  vehicle_state_changed: {
    group: 'vehicle_and_combat',
    level: 'core',
    payload: { from: 'text', to: 'text', reason: 'text' },
  },
  vehicle_configuration_changed: {
    group: 'vehicle_and_combat',
    level: 'core',
    payload: { visualTier: 'integer' },
  },
  vehicle_destroyed: {
    group: 'vehicle_and_combat',
    level: 'core',
    payload: { cause: 'text', kind: 'text', tier: 'integer', arc: 'text' },
  },
  enemy_killed: {
    group: 'vehicle_and_combat',
    level: 'core',
    payload: { kind: ENEMY_KIND, tier: 'integer', by: 'text' },
  },
  enemy_type_encountered: {
    group: 'vehicle_and_combat',
    level: 'core',
    payload: { kind: ENEMY_KIND },
  },
  vehicle_damaged: {
    group: 'vehicle_and_combat',
    level: 'detail',
    payload: {
      amount: 'money',
      arc: HIT_ARC,
      enemyId: 'text',
      kind: ENEMY_KIND,
      tier: 'integer',
      hullAfter: 'money',
    },
  },
  enemy_spawned: {
    group: 'vehicle_and_combat',
    level: 'detail',
    payload: { enemyId: 'text', kind: ENEMY_KIND, tier: 'integer', spawnPointId: 'text' },
  },
  // Continuous drill damage is summed per 30 ticks (#9); `ram` is reserved for enemy armour hits.
  enemy_damaged: {
    group: 'vehicle_and_combat',
    level: 'detail',
    payload: {
      enemyId: 'text',
      amount: 'money',
      source: { oneOf: ['drill', 'ram'] },
      arc: HIT_ARC,
      ticks: 'integer',
    },
  },
  enemy_despawned: { group: 'vehicle_and_combat', level: 'detail', payload: { enemyId: 'text' } },
  weapon_fired: { group: 'vehicle_and_combat', level: 'detail', payload: 'unspecified' },
  player_killed: { group: 'vehicle_and_combat', payload: 'reserved' },

  // Multiplayer: names reserved by design doc section 22 until the co-op ticket specifies them.
  player_joined: { group: 'multiplayer', payload: 'reserved' },
  player_left: { group: 'multiplayer', payload: 'reserved' },
  player_revived: { group: 'multiplayer', payload: 'reserved' },
  shared_resource_transfer: { group: 'multiplayer', payload: 'reserved' },
  cooperative_core_harvest: { group: 'multiplayer', payload: 'reserved' },
  multiplayer_desync_detected: { group: 'multiplayer', payload: 'reserved' },
  host_migration: { group: 'multiplayer', payload: 'reserved' },
  network_interruption: { group: 'multiplayer', payload: 'reserved' },
} as const satisfies Readonly<Record<string, RegisteredEvent>>

export type RunEventName = keyof typeof RUN_EVENT_REGISTRY

export const ALL_RUN_EVENT_NAMES = Object.keys(RUN_EVENT_REGISTRY) as readonly RunEventName[]

/** Free-form payload of an event whose fields are not specified yet (dev builds only). */
export type UnspecifiedEventData = Readonly<Record<string, unknown>>

type PayloadSpecOf<N extends RunEventName> = (typeof RUN_EVENT_REGISTRY)[N]['payload']

/** What `record` must be given for event `N`: reserved names take nothing that compiles. */
export type RunEventData<N extends RunEventName> =
  PayloadSpecOf<N> extends 'reserved'
    ? never
    : PayloadSpecOf<N> extends 'unspecified'
      ? UnspecifiedEventData
      : PayloadOf<PayloadSpecOf<N>>

export function registeredEventOf(name: string): RegisteredEvent | undefined {
  return Object.hasOwn(RUN_EVENT_REGISTRY, name)
    ? RUN_EVENT_REGISTRY[name as RunEventName]
    : undefined
}
