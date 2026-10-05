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
 */
export const AUTHORITY_PROTOCOL_VERSION = 2

export interface CommandPayloads {
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
  /** The workshop: one level of one upgrade track (#7). */
  buyUpgrade: { upgradeId: string }
  /** Moves the docked platform to the next planet, paying the fee and the core (#10). */
  travel: { toPlanet: number }
  'debug.setUpgrade': { upgradeId: string; level: number }
  /** Energy in units as a decimal string, a whole number of 1/240 quanta (#11 amendment 2). */
  'debug.setEnergy': { energy: string }
  /** Hull as a canonical decimal string (a BigStat, #7). */
  'debug.setHull': { hull: string }
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
}

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
