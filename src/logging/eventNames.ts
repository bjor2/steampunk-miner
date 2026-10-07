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
 *
 * Slices register their own events in the `runEvents` registry (`registries/runEvents.ts`, K1),
 * which `registeredEventOf` asks for any name this table does not hold.
 */
import type { FieldKind, PayloadFields, PayloadOf } from './eventFields'
import { sliceRunEventOf } from './registries/runEvents'

export type RunEventLevel = 'core' | 'detail' | 'perf'

export type RunEventGroup =
  'run' | 'progression' | 'platform' | 'mining' | 'vehicle_and_combat' | 'multiplayer'

export type RegisteredEvent =
  | { group: RunEventGroup; level: RunEventLevel; payload: PayloadFields | 'unspecified' }
  | { group: RunEventGroup; payload: 'reserved' }

const ENEMY_KIND = {
  oneOf: ['crawler', 'burrower', 'tunnel_wrecker'],
} as const satisfies FieldKind
const HIT_ARC = { oneOf: ['front', 'side', 'rear'] } as const satisfies FieldKind
const BAY = { oneOf: ['sell', 'upgrade', 'refinery'] } as const satisfies FieldKind

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
  // One per second of frames (#38 Consequences: render scale, frame p50/p95, draw calls,
  // triangles and visible ground blocks join the #4 terrain and collider counts; #121: the p99
  // frame and the frames over 50 ms).
  perf_sample: {
    group: 'run',
    level: 'perf',
    payload: {
      frameMsP50: 'float',
      frameMsP95: 'float',
      frameMsP99: 'float',
      longTasks: 'integer',
      terrainMsP95: 'float',
      renderScale: 'float',
      colliders: 'integer',
      drawCalls: 'integer',
      triangles: 'integer',
      groundBlocks: 'integer',
      chunksLoaded: 'integer',
    },
  },
  // #124: one timed series of a bench script run with `--log`, in the bench's own run folder.
  // Times are whole microseconds, as floats belong to perf_sample alone (#11 value rules).
  benchmark_result: {
    group: 'run',
    level: 'perf',
    payload: {
      name: 'text',
      medianUs: 'integer',
      p95Us: 'integer',
      runs: 'integer',
      commit: 'text',
    },
  },
  // Every 10 s of frames (#121, logging strategy section 2): what the page, the renderer and the
  // physics hold, beside how far the run got, so memory reads against progress and not only time.
  // Sizes are whole KiB (1024 bytes), as floats belong to perf_sample alone (#11 value rules, as
  // #124 kept them); the planet and the depth now are on the envelope. Never forces a GC.
  memory_sample: {
    group: 'run',
    level: 'perf',
    payload: {
      elapsedS: 'integer',
      jsHeapUsedKB: 'integer',
      jsHeapTotalKB: 'integer',
      jsHeapLimitKB: 'integer',
      wasmKB: 'integer',
      geometries: 'integer',
      textures: 'integer',
      programs: 'integer',
      rigidBodies: 'integer',
      colliders: 'integer',
      chunksCached: 'integer',
      chunksMeshed: 'integer',
      domNodes: 'integer',
      listeners: 'integer',
      maxDepthTiles: 'integer',
      tilesDestroyed: 'integer',
      mineralsCollected: 'integer',
      moneyTotal: 'money',
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
  // A locked-schedule row (#79 id) that opened on this travel (#88); the envelope's `planet` is
  // the planet arrived at.
  feature_unlocked: { group: 'progression', level: 'core', payload: { featureId: 'text' } },
  // The artefact cache (#46); the envelope's `planet` is the cache's planet. The cache is
  // generated whatever the player holds, so `artefact_cache_spawned` is said on every planet.
  artefact_cache_spawned: {
    group: 'progression',
    level: 'core',
    payload: { tx: 'integer', ty: 'integer', band: 'integer' },
  },
  artefact_open: { group: 'progression', level: 'core', payload: { tx: 'integer', ty: 'integer' } },
  artefact_chosen: { group: 'progression', level: 'core', payload: { optionId: 'text' } },

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
      coinsShown: 'integer',
    },
  },
  // #76 amendment (#115, #128): what a Sell bay payout paid of the bill it found (forgiven 0), or,
  // on leaving the bay, the bill the visit's payouts could not cover (paid 0, all forgiven).
  lining_settled: {
    group: 'platform',
    level: 'core',
    payload: { billed: 'money', paid: 'money', forgiven: 'money' },
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
  // #113: a lining type unlocked at the Upgrade bay, and the type the rings are laid in from now on.
  lining_type_unlocked: {
    group: 'platform',
    level: 'core',
    payload: { type: 'text', price: 'money' },
  },
  lining_type_selected: { group: 'platform', level: 'core', payload: { type: 'text' } },
  // #162 (K4): one loadout slot changed at the platform, and an `equipItem` that changed nothing.
  // The names are the spec's; `none` stands for an empty slot, as in `vehicle_destroyed`.
  equip_item: { group: 'platform', level: 'core', payload: { slot: 'text', itemId: 'text' } },
  equip_refused: {
    group: 'platform',
    level: 'core',
    payload: {
      slot: 'text',
      itemId: 'text',
      reason: {
        oneOf: ['not_owned', 'slot_locked', 'exclusive_taken', 'not_docked', 'wrong_slot'],
      },
    },
  },
  // #107: the auto_guns turret bolted on at level 1, then each gun level bought.
  gun_mounted: { group: 'platform', level: 'core', payload: { level: 'integer', price: 'money' } },
  gun_upgraded: {
    group: 'platform',
    level: 'core',
    payload: { from: 'integer', to: 'integer', price: 'money' },
  },
  // #109: the Upgrade bay filled the charge rack, or added one slot to it.
  charges_restocked: {
    group: 'platform',
    level: 'core',
    payload: { count: 'integer', price: 'money' },
  },
  charge_rack_upgraded: {
    group: 'platform',
    level: 'core',
    payload: { from: 'integer', to: 'integer', price: 'money' },
  },
  purchase_made: { group: 'platform', level: 'core', payload: 'unspecified' },
  // The Refinery bay (#105). The envelope's `planet` is where the line happened: the queue's and
  // the slot's planet, the platform's when a batch is ready, and the Sell bay's on collection, so
  // `refine_collected` names the planet the batch was queued on as `queuedPlanet`.
  refine_queued: {
    group: 'platform',
    level: 'core',
    payload: { slot: 'integer', tier: 'integer', units: 'integer', requestedUnits: 'integer' },
  },
  refine_ready: {
    group: 'platform',
    level: 'core',
    payload: { slot: 'integer', tier: 'integer', units: 'integer' },
  },
  refine_collected: {
    group: 'platform',
    level: 'core',
    payload: {
      slot: 'integer',
      tier: 'integer',
      units: 'integer',
      rawValue: 'money',
      value: 'money',
      waitSeconds: 'integer',
      queuedPlanet: 'integer',
    },
  },
  refinery_slot_bought: {
    group: 'platform',
    level: 'core',
    payload: { slots: 'integer', price: 'money' },
  },
  rescue_triggered: {
    group: 'platform',
    level: 'core',
    payload: {
      cause: { oneOf: ['destroyed', 'stranded'] },
      fee: 'money',
      cargoLostValue: 'money',
    },
  },
  // `assay_beacon` priced a sold tier at the mid-band unit price (#46, economy detail).
  artefact_assay_applied: {
    group: 'platform',
    level: 'detail',
    payload: { tier: 'integer', band: 'integer', unitPrice: 'money' },
  },
  checkpoint_saved: {
    group: 'platform',
    level: 'core',
    payload: { slot: 'text', epoch: 'integer', bytes: 'integer', digest: 'text' },
  },
  // #170: an older save was brought up to this build by one step of the migration chain, logged
  // per step just before checkpoint_loaded; #181 added the snapshot step (levels to steps). #224:
  // one more line names the registered slice sections the save lacked, restored at their initial
  // values; it has no version step, so the step fields became optional (every line written before
  // still reads the same).
  save_migrated: {
    group: 'platform',
    level: 'core',
    payload: {
      version: { optional: { oneOf: ['snapshotVersion', 'generatorVersion'] } },
      from: { optional: 'integer' },
      to: { optional: 'integer' },
      restoredSections: { optional: { listOf: { section: 'text' } } },
    },
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
  // #113: the heat gauge rose past the throttle line or its max (in gauge points), and the time the
  // drill is throttled, from rising past the throttle line to falling back below it.
  heat_threshold: { group: 'vehicle_and_combat', level: 'core', payload: { level: 'integer' } },
  overheat_started: { group: 'vehicle_and_combat', level: 'core', payload: {} },
  overheat_ended: { group: 'vehicle_and_combat', level: 'core', payload: {} },
  // #113: the vehicle touched lava (the cell's tile), and loose lava stopped at a refractory-lined
  // cell (`ring` its centre in mm, as `ring_gnawed` names a ring).
  lava_contact: {
    group: 'vehicle_and_combat',
    level: 'core',
    payload: { tx: 'integer', ty: 'integer' },
  },
  lava_blocked: { group: 'mining', level: 'core', payload: { ring: 'text' } },
  energy_low: { group: 'mining', level: 'core', payload: { threshold: 'integer' } },
  rare_resource_discovered: { group: 'mining', level: 'core', payload: 'unspecified' },
  tile_drilled: { group: 'mining', level: 'detail', payload: 'unspecified' },
  tile_destroyed: {
    group: 'mining',
    level: 'detail',
    payload: { tx: 'integer', ty: 'integer', kind: { oneOf: ['ground', 'ore', 'core'] } },
  },
  // K2 (#185, #142 acceptance 13): a slice's gate check stopped the drill at an ore cell, once per
  // drilling command that met it; `required` and `have` are the gate's own words.
  gate_hit: {
    group: 'mining',
    level: 'core',
    payload: {
      oreId: 'text',
      family: 'text',
      tier: 'integer',
      gateKind: 'text',
      outcome: { oneOf: ['refused', 'lost'] },
      required: 'text',
      have: 'text',
      tx: 'integer',
      ty: 'integer',
    },
  },
  // #41: one ring of lining, and lining the drill cleared (one line per drilling command).
  casing_placed: {
    group: 'mining',
    level: 'detail',
    payload: { samples: 'integer', relined: 'integer', grade: 'integer' },
  },
  // #76: the first-place lining charge of one ring; relining is free and logs none. `type` is the
  // lining type laid (#113), so the bill splits by type; a type change is charged like new lining.
  casing_lined: {
    group: 'mining',
    level: 'core',
    payload: {
      lengthMm: 'integer',
      band: 'integer',
      grade: 'integer',
      type: 'text',
      price: 'money',
    },
  },
  // #111: a tunnel wrecker (or `debug.gnawCasing`) breached one ring; `ring` is its axis point `x,y`
  // in mm and `band` the deepest band of the wall it breached.
  ring_gnawed: { group: 'mining', level: 'core', payload: { ring: 'text', band: 'integer' } },
  // #109: a charge planted on the wall at tile `tx, ty`, and its detonation there. K6 (#189): its
  // ground breaks as a live blast, summed up once by `blast_resolved`: tiles cleared, ore units sent
  // to the hold, the sale value of the blasted ore that never reached it, the rim blocks checked,
  // the warnings they started, and the ticks it was live.
  charge_planted: {
    group: 'mining',
    level: 'core',
    payload: { tx: 'integer', ty: 'integer', detonateTick: 'integer', carried: 'integer' },
  },
  // #213: the detonation's ladder size and radius, copied from its blast (K3 #186). Optional, so a
  // line logged before them still reads (`readChargeDetonation` takes it as size 1); the game
  // always writes `size`, and `radiusMm` whenever the blast has one. A render hint only: balance
  // keys off `size`, never the radius.
  charge_detonated: {
    group: 'mining',
    level: 'core',
    payload: {
      tx: 'integer',
      ty: 'integer',
      size: { optional: 'integer' },
      radiusMm: { optional: 'integer' },
    },
  },
  blast_resolved: {
    group: 'mining',
    level: 'core',
    payload: {
      tx: 'integer',
      ty: 'integer',
      radiusMm: 'integer',
      size: 'integer',
      tilesCleared: 'integer',
      oreUnits: 'integer',
      oreValueLost: 'money',
      collapseChecks: 'integer',
      collapsesTriggered: 'integer',
      ticks: 'integer',
    },
  },
  casing_drilled: {
    group: 'mining',
    level: 'detail',
    payload: { samples: 'integer', grade: 'integer' },
  },
  // #41: edge-triggered when the vehicle enters a band (6: the core) its grade does not hold, and
  // the edge back; they drive the amber HUD badge.
  casing_grade_insufficient: {
    group: 'mining',
    level: 'core',
    payload: { band: 'integer', grade: 'integer', required: 'integer' },
  },
  casing_grade_sufficient: {
    group: 'mining',
    level: 'core',
    payload: { band: 'integer', grade: 'integer' },
  },
  // #43: a weak block near a vehicle telegraphs for 60 ticks, then refills; `block` is `cx,cy#index`.
  collapse_warning: {
    group: 'mining',
    level: 'core',
    payload: { block: 'text', band: 'integer', weakestGrade: 'integer', required: 'integer' },
  },
  collapse_cancelled: { group: 'mining', level: 'detail', payload: { block: 'text' } },
  collapse: {
    group: 'mining',
    level: 'core',
    payload: { block: 'text', samplesFilled: 'integer', vehiclesHit: 'integer' },
  },
  // One line per drilling command (a pose report's interval or a `drillTile`), #7: `damage` is
  // `ticks * drillPower * eff / 60` in hardness units.
  drill_damage_dealt: {
    group: 'mining',
    level: 'detail',
    payload: { tx: 'integer', ty: 'integer', ticks: 'integer', damage: 'money' },
  },
  // #122: which ore (the `oreId` #155 names), whole tiles below the surface of its cell's column
  // (`oreDepthTiles`: the envelope's `depthTiles` is the vehicle's) and its chunk as `cx,cy`; the
  // envelope's `seq` orders the lines into the mined order `summary.json` keeps.
  resource_collected: {
    group: 'mining',
    level: 'detail',
    payload: {
      resourceTier: 'integer',
      amount: 'integer',
      value: 'money',
      oreId: 'text',
      // #223: a slice catalogue's family and signature flag; the kernel default logs neither.
      family: { optional: 'text' },
      signature: { optional: 'flag' },
      oreDepthTiles: 'integer',
      chunk: 'text',
    },
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
  // #43: `source` says an enemy hit or a collapse crushed; a crush has no enemy, so its arc and kind
  // read `none`, its enemyId '' and its tier 0, as `vehicle_destroyed` does with no attacker. A
  // charge's blast on its own vehicle (#109) reads the same way.
  vehicle_damaged: {
    group: 'vehicle_and_combat',
    level: 'detail',
    payload: {
      amount: 'money',
      source: { oneOf: ['drill-contact enemy', 'collapse', 'blast', 'heat', 'lava'] },
      arc: { oneOf: [...HIT_ARC.oneOf, 'none'] },
      enemyId: 'text',
      kind: { oneOf: [...ENEMY_KIND.oneOf, 'none'] },
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
      source: { oneOf: ['drill', 'ram', 'blast'] },
      arc: { oneOf: [...HIT_ARC.oneOf, 'none'] },
      ticks: 'integer',
    },
  },
  enemy_despawned: { group: 'vehicle_and_combat', level: 'detail', payload: { enemyId: 'text' } },
  // #111: a tunnel wrecker came to ring `x,y` (mm) of a vehicle's route in `band`, and later went
  // into the rock out of every vehicle's sight (a killed one logs `enemy_killed` instead).
  wrecker_spawned: {
    group: 'vehicle_and_combat',
    level: 'core',
    payload: { enemyId: 'text', ring: 'text', band: 'integer' },
  },
  wrecker_fled: { group: 'vehicle_and_combat', level: 'core', payload: { enemyId: 'text' } },
  // #107: the guns' hits on one enemy since the shooter's last pose report (never one line a
  // shot), with the energy they took in quanta: a dive's gun energy is the sum of its lines.
  gun_hit: {
    group: 'vehicle_and_combat',
    level: 'core',
    payload: { enemyId: 'text', damage: 'money', shots: 'integer', energy: 'integer' },
  },
  gun_mode: {
    group: 'vehicle_and_combat',
    level: 'core',
    payload: { mode: { oneOf: ['auto', 'off'] } },
  },
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

/** The kernel's entry first, so a kernel name never reads the slice registry. */
export function registeredEventOf(name: string): RegisteredEvent | undefined {
  return Object.hasOwn(RUN_EVENT_REGISTRY, name)
    ? RUN_EVENT_REGISTRY[name as RunEventName]
    : sliceRunEventOf(name)
}
