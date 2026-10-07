/**
 * Authority commands (decision #3): intents, sent as `{ playerId, tick, seq, type, payload }` and
 * replayed from `commands.ndjson`, so every field is plain JSON (money as decimal strings).
 * Commands are ordered by `(tick, seq)`; `tick` is the fixed 1/60 s step, never wall-clock.
 *
 * Debug and scenario commands are the `debug.*` types (#11 section 4); `isDebugCommandType`
 * marks them instead of a separate flag that could disagree with the type.
 */

import type { BayId } from '../world/dockBays'

/**
 * Bump when a command or domain event changes shape or meaning; run metadata records it.
 * 2: `Dock {bay}` and the two bays of #37, with the run starting in the Sell bay.
 * 3: the vehicle's casing grade and `BuyCasingGrade` (#41, #58).
 * 4: the artefact commands and events (#46).
 * 5: the casing layer in chunk deltas, its events and debug commands (#41, #56).
 * 6: collapse (#43, #57): its events, `debug.forceCollapse` and `VehicleDamaged.source`.
 * 7: the first-place lining charge (#76, #85): drilling now debits the wallet, `CasingLined`.
 * 8: breached casing and the tunnel wrecker (#111, #94): casing 255 in chunk deltas,
 *    `CasingBreached`, `RingGnawed`, the wrecker's events and `debug.gnawCasing`.
 * 9: `auto_guns` (#93, #107): the vehicle's gun, `BuyGun`, `SetGunMode`, `debug.setGunLevel`, gun
 *    shots on the clock, `GunHit` and `EnemyKilled {by: gun}`.
 * 10: the Refinery bay (#105, #92): `Dock {bay: refinery}`, its commands, slots and events.
 * 11: scripted mining (`drillTile`) lays and charges casing as a pose's drilling does, lining is
 *    charged per metre of tunnel axis, not per ring, and onto the vehicle's lining bill, settled
 *    out of the next sale as `LiningSettled` instead of debited mid-dive (#115, #76 amendment).
 * 12: the bill is settled per Sell bay visit (#128): each payout, collected Refinery batches too,
 *    logs what it paid as `LiningSettled`, and undocking logs what the visit forgave.
 * 13: blasting charges (#109, #95): the rack and charge commands, their events,
 *    `debug.setCharges`, and blast sources on `VehicleDamaged` and the enemy events.
 * 14: heat, lava and the refractory lining (#113, #96): lining types in the casing layer and on the
 *    vehicle, `BuyLiningType`, `SelectLiningType`, `debug.setLiningType`, `CasingLined.liningType`;
 *    the heat gauge, its throttle and damage, `HeatThreshold`, `Overheat*`, `debug.setHeat`.
 * 15: drill_power and drill_tip prices flattened to ratio 1.225 and 1.500625 on bases 55 and 83
 *    (#84, #77), so the same `BuyUpgrade` costs a different amount.
 * 16: `CargoAdded` names its ore (#122): `oreId` (#155), the cell's `depthTiles` and `chunk`; a
 *    blast's kept units are the first ore cells of their tier it broke.
 * 17: the vehicle's loadout (K4, #162): `equipItem`, `debug.setVehicleLoadout`, `ItemEquipped`
 *    and `EquipRefused`.
 * 18: the sliced live blast and the shared terrain-edit queue (K6, #189): a charge's ground breaks
 *    64 tiles a tick after it blows, `ChargeDetonated` keeps only its tile, `BlastFront` and
 *    `BlastResolved` join, a blast's `TileDestroyed` carries `cause: 'blast'`, and power-up
 *    terrain edits apply from the queue.
 * 19: `QuickService` works at the Workshop (`upgrade`) as well as at Sell, and is refused
 *    `wrong_bay` at the Refinery only (#170, #175).
 * 20: the brass tracks and casing grades flattened to drill power's ratio 1.225 on bases 24, 23,
 *    36, 46 and 48 (#195), so the same `BuyUpgrade` and `BuyCasingGrade` cost a different amount.
 * 21: `ChargeDetonated` carries its blast's ladder `size` and `radiusMm` (#213).
 * 22: the tech tree slice (#165): `tech-tree.unlock_node` and `debug.tech-tree.unlockThrough`,
 *    answered by `tech-tree.TechNodeUnlocked`, `tech-tree.TechNodeRefused` and
 *    `tech-tree.TechNodesGranted`; its `tech-tree` player section v1.
 * 23: `ResourceSold` carries `coinsShown`, the sell burst's coin count from the sale's gross value
 *    against the cheapest next Workshop level (ticket 220, TD lock on #176).
 * 24: the codex slice (#207): its authority reaction answers `codex.OreContacted`,
 *    `codex.OreDiscovered` and `codex.EntryAdded` beside the touch or unit that caused them; its
 *    `codex` player section v1.
 * 25: travel logs `FeatureUnlocked` for the dock add-on facilities `scanner_station` (P14),
 *    `research_lab` (P15) and `drone_bay` (P20), now built and shipped (#221, #222).
 * 26: `CargoAdded` may name the ore's catalogue `family` and whether it is a `signature` ore
 *    (#223, for #146 and #141); the kernel default names neither, so its answers are unchanged.
 * 27: two-tier levels (#180 sections 3 and 4, #181): a track and the guns store a step `10L + k`,
 *    `BuyUpgrade` buys one step at its chain price, `BuyGun` mounts at step 10 and then buys steps,
 *    `debug.setUpgrade` and `debug.setGunLevel` take steps, `UpgradePurchased` holds steps in
 *    `fromLevel`/`toLevel` and adds `fromMajor`, `toMajor` and `isMajor`, stats follow the pips,
 *    the drill gates read the tip of the last completed major and the visual tier counts majors.
 * 28: hold-to-buy chains (#180 section 2, ticket 226): `BuyUpgrade`, `BuyGun`, `BuyChargeRackSlot`
 *    and `BuyCasingGrade` carry `chain` (0 a click, else the hold's id), a held step under the
 *    service reserve is refused `service_reserve`, and their purchase events carry the chain and,
 *    for a held step, `reserveLeft`; `CommandRejected` names the chain of a refused held step.
 * 29: the ores slice's catalogue names every ore (#146): `CargoAdded.oreId` is `<family>_t<tier>`
 *    with its `family` and `signature`, and lead cells carry tiers up to two above their band.
 * 30: the power-up core slice (#200): `power-up-core.use_power_up` and its clock step, the free
 *    dock refill, its `power-up-core` player section v1 and the three `slot.powerup_*` cradles.
 */
export const AUTHORITY_PROTOCOL_VERSION = 30

/** The kernel's own commands: the closed set its rule tables are written against. */
export interface KernelCommandPayloads {
  /**
   * The local vehicle's pose at 5 Hz (#11 amendments, #7): integer mm and mm/s, the body-up vector
   * scaled to 1024, `facing` 0 to 3, the action flags at the moment of the report, and how many
   * fixed steps since the previous report each action was active, which the authority charges.
   */
  reportPose: {
    x: number
    y: number
    vx: number
    vy: number
    upx: number
    upy: number
    facing: number
    driving: boolean
    thrusting: boolean
    drilling: boolean
    thrustTicks: number
    driveTicks: number
    drillTicks: number
  }
  /** Scripted mining (#3, #11 section 5): `ticks` fixed steps of drilling on one tile. */
  drillTile: { tx: number; ty: number; ticks: number }
  /** Calls the tow for a stranded or destroyed vehicle (#7, #8). */
  requestRescue: Record<string, never>
  /** The platform (#8, #23, #37): dock when stationary in that bay's pad zone, and leave again. */
  dock: { bay: BayId }
  undock: Record<string, never>
  /** The shop: one ore tier, or `"all"` of the hold's ore. */
  sellCargo: { resourceTier: number | 'all' }
  /** The workshop's repair and the charging station, each to full at current prices. */
  repairHull: Record<string, never>
  rechargeEnergy: Record<string, never>
  /** "Sell, repair and recharge": sell all, repair, recharge, in that order (#8). */
  quickService: Record<string, never>
  /**
   * The workshop: one step of one upgrade track (#7, #180). On every stepped row `chain` is 0 for a
   * click, else the id of the hold the step belongs to (ticket 226, `purchaseChain.ts`).
   */
  buyUpgrade: { upgradeId: string; chain: number }
  /** The Upgrade bay's Casing row: one casing grade, not a vehicle track (#41, #58). */
  buyCasingGrade: { chain: number }
  /**
   * The Upgrade bay's Guns row (#107): mounts the guns once `auto_guns` is unlocked, then raises
   * the gun track one level a buy.
   */
  buyGun: { chain: number }
  /** The HUD toggle: `"auto"` fires by itself, `"off"` saves the boiler (#107). */
  setGunMode: { mode: string }
  /**
   * The Upgrade bay's Lining row (#113): unlocks a lining type once its row is open (refractory
   * from planet 8) and makes it the active type; `selectLiningType` switches between owned types.
   */
  buyLiningType: { liningType: string }
  selectLiningType: { liningType: string }
  /**
   * The Refinery bay (#105): moves up to half the hold of one ore tier into a free slot, and buys
   * the next slot. Ready batches are collected, and paid, at the Sell bay only.
   */
  queueRefine: { resourceTier: number; units: number }
  buyRefinerySlot: Record<string, never>
  collectRefined: Record<string, never>
  /** Moves the docked platform to the next planet, paying the fee and the core (#10). */
  travel: { toPlanet: number }
  /** `interact` while overlapping the planet's live artefact cache opens its choice (#46). */
  openArtefactCache: Record<string, never>
  /** Takes one of the three options for good; the other two are gone (#46). */
  chooseArtefact: { optionId: string }
  /**
   * Plants a charge of `size` from the rack on the wall the last reported pose faces; it blows after
   * its size's fuse, or waits for the plunger if remote (#109, sizes K8 #218).
   */
  plantCharge: { size: number }
  /** The Upgrade bay sells `count` charges of `size` if they fit the rack, never fewer (K8 #218). */
  restockCharges: { size: number; count: number }
  /** The Upgrade bay adds one slot to the rack (#109). */
  buyChargeRackSlot: { chain: number }
  /**
   * The loadout (#162 TD lock, K4): puts an owned item in a slot that accepts it, or empties the
   * slot with a null item; docked at the platform only. A refusal is answered as `EquipRefused`.
   */
  equipItem: { slot: string; itemId: string | null }
  'debug.setUpgrade': { upgradeId: string; level: number }
  /** Energy in units as a decimal string, a whole number of 1/240 quanta (#11 amendment 2). */
  'debug.setEnergy': { energy: string }
  /** Hull as a canonical decimal string (a BigStat, #7). */
  'debug.setHull': { hull: string }
  /** The player holds this artefact, as if chosen from this planet's cache (a scenario start). */
  'debug.setArtefact': { optionId: string }
  'debug.setPlanet': { planetIndex: number }
  'debug.setPlanetSeed': { planetSeed: number }
  /** Adds `amount` (a decimal string) to the player's wallet. */
  'debug.grantMoney': { amount: string }
  /** Sets the platform's core bay to `count` fragments (#10 `setCoreFragments`). */
  'debug.setCoreFragments': { count: number }
  /** Replaces the player's wallet with `amount` (a start scenario's money). */
  'debug.setMoney': { amount: string }
  /**
   * Combat (#9, #11 amendment): an enemy of any registered kind and tier, `dx, dy` whole tiles
   * from the vehicle's tile, hunting this player's vehicle.
   */
  'debug.spawnEnemy': { kind: string; tier: number; dx: number; dy: number }
  'debug.clearEnemies': Record<string, never>
  /**
   * Puts the vehicle at rest in one bay and docks it there, no tow and no fee (#11 section 5,
   * #37: scripted runs move between the bays with it).
   */
  'debug.teleportToDock': { bay: BayId }
  /** Frozen enemies neither move, wind up, attack nor spawn; the drill still cuts them. */
  'debug.freezeEnemies': { frozen: boolean }
  /**
   * The ground (#36): lower or raise density by up to `amount` (0 to 255) in a disc of `radius`
   * mm round `(x, y)` mm, softened at the rim like the drill's stamp. Never cuts the dock pad.
   */
  'debug.carveCircle': { x: number; y: number; radius: number; amount: number }
  'debug.fillCircle': { x: number; y: number; radius: number; amount: number }
  /** Sets the gun step directly, 0 (no guns) or the mount to the cap (#107 combat scenarios, #180). */
  'debug.setGunLevel': { level: number }
  /** A mounted rack with `slotLevel` bought slots carrying only `carried` charges of `size` (#109). */
  'debug.setCharges': { size: number; carried: number; slotLevel: number }
  /** Sets the vehicle's casing grade directly (#41 `debug.setCasingGrade`). */
  'debug.setCasingGrade': { grade: number }
  /** Owns and selects a lining type, with no unlock or price (#113 scenarios). */
  'debug.setLiningType': { liningType: string }
  /**
   * A scenario's loadout (K4), replacing the vehicle's: each named slot holds its item, every slot
   * not named is empty, and the vehicle owns exactly those items and `owned` (extractors, cradles,
   * spares), with no dock, price or slot lock.
   */
  'debug.setVehicleLoadout': { slots: Readonly<Record<string, string>>; owned: readonly string[] }
  /** Sets the heat gauge to whole gauge points, 0 to its max, settled at the command's tick (#113). */
  'debug.setHeat': { heat: number }
  /** One ring of casing lining of `grade` round `(x, y)` mm, in the active lining type (#41, #113). */
  'debug.lineCasing': { x: number; y: number; grade: number }
  /** Breaches the ring of lining round `(x, y)` mm as a tunnel wrecker's gnaw does (#111). */
  'debug.gnawCasing': { x: number; y: number }
  /**
   * Starts the collapse of one block (`cx,cy#index`) now, as if it were weak (#43
   * `debug.forceCollapse`): it warns for the full 60 ticks and refills whatever its lining.
   */
  'debug.forceCollapse': { block: string }
}

/**
 * Every command, the kernel's and the slices'. A slice adds its commands by module augmentation,
 * each type prefixed `<slice>.` (or `debug.<slice>.` for a debug command), and registers their
 * rules (docs/standards/feature-slices.md 3.15):
 *
 *   declare module '<path to>/systems/authority/authorityCommand' {
 *     interface CommandPayloads { 'example.ringBell': { strokes: number } }
 *   }
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- the slices' augmentation point
export interface CommandPayloads extends KernelCommandPayloads {}

export type KernelCommandType = keyof KernelCommandPayloads

export type CommandType = keyof CommandPayloads

/** Who sent a command and where it sits in the `(tick, seq)` order; domain events carry it too. */
export interface CommandStamp {
  playerId: string
  tick: number
  /** Strictly increasing per player. */
  seq: number
}

/** What a caller wants done; the sender adds the stamp when it submits. */
export type CommandIntent<T extends CommandType = CommandType> = {
  [K in T]: { type: K; payload: CommandPayloads[K] }
}[T]

export type AuthorityCommand<T extends CommandType = CommandType> = CommandStamp & CommandIntent<T>

export function isDebugCommandType(type: CommandType): boolean {
  return type.startsWith('debug.')
}
