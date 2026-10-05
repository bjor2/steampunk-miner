/**
 * The combat part of authority state (decision #9: enemies are a pure tile-grid simulation inside
 * the authority, not Rapier bodies). Plain integers, strings and BigStat, so the canonical JSON and
 * the digest cover it, and immutable like the rest of the state.
 *
 * Enemies are transient: a dock or a tow ends the trip, despawns the docking vehicle's enemies and
 * forgets used spawn points (#9 "Killed enemies stay dead for the trip"), so a checkpoint taken at a
 * dock holds none. Positions are integer mm on the planet's grid, like reported poses.
 */
import type { EnemyKind, HitArc } from '../../economy/economyDefinition'
import { ZERO_MONEY, type BigStat } from '../../money'

/**
 * `idle` waits out of detection range, `approach` closes in, `windup` is the telegraph (the
 * burrower's tremor), `lunge` the attack, `recoil` the back-off after a side or rear hit or a
 * released pin, `pinned` stuck on the drill head.
 */
export type EnemyPhase = 'idle' | 'approach' | 'windup' | 'lunge' | 'recoil' | 'pinned'

export interface MillimetreStep {
  x: number
  y: number
}

/** Drill damage not yet logged: `enemy_damaged` sums a pinned enemy's drill per 30 ticks (#9). */
export interface PendingDrillDamage {
  amount: BigStat
  ticks: number
}

export interface Enemy {
  id: string
  kind: EnemyKind
  tier: number
  /** The spawn point it came from, or `debug` for `spawnEnemy`. */
  spawnPointId: string
  /** The vehicle it was activated for and hunts (#9: at most 6 per vehicle). */
  ownerId: string
  x: number
  y: number
  health: BigStat
  phase: EnemyPhase
  phaseSinceTick: number
  /** The earliest tick its next wind-up may start (the attack cooldown). */
  readyTick: number
  /** The lunge or recoil step per tick, fixed when that phase starts. */
  step: MillimetreStep
  pendingDrill: PendingDrillDamage
}

/** What combat remembers about each vehicle besides its pose. */
export interface CombatVehicle {
  /** The tick of the last accepted pose report: extrapolation counts from it (#9, #11). */
  reportTick: number
  /** Enemies in this vehicle's front zone at that report. */
  frontAtReport: readonly string[]
  /** The same for the report before it, for the latency rule (#9: doubt favours the player). */
  previousReportTick: number
  frontAtPreviousReport: readonly string[]
  /** The tick of the last damaging hit; none lands within `hitGraceTicks` of it (#7, #9). */
  lastHitTick: number | null
}

export interface CombatState {
  /** `freezeEnemies(true)`: enemies neither move, wind up, attack nor spawn. */
  isFrozen: boolean
  nextEnemyNumber: number
  /** Active enemies in spawn order, which is also the order they act in each tick. */
  enemies: readonly Enemy[]
  /** Spawn points whose enemy was killed this trip. */
  usedSpawnPointIds: readonly string[]
  /** Kinds met this run: `enemy_type_encountered` fires once per kind (#9, #14). */
  encounteredKinds: readonly EnemyKind[]
  vehicles: Readonly<Record<string, CombatVehicle>>
}

export const NEW_COMBAT: CombatState = {
  isFrozen: false,
  nextEnemyNumber: 1,
  enemies: [],
  usedSpawnPointIds: [],
  encounteredKinds: [],
  vehicles: {},
}

export const NO_PENDING_DRILL: PendingDrillDamage = { amount: ZERO_MONEY, ticks: 0 }

export const DEBUG_SPAWN_POINT_ID = 'debug'

const NO_REPORT: CombatVehicle = {
  reportTick: 0,
  frontAtReport: [],
  previousReportTick: 0,
  frontAtPreviousReport: [],
  lastHitTick: null,
}

export function combatVehicleOf(combat: CombatState, playerId: string): CombatVehicle {
  return combat.vehicles[playerId] ?? NO_REPORT
}

export function withCombatVehicle(
  combat: CombatState,
  playerId: string,
  change: Partial<CombatVehicle>,
): CombatState {
  const vehicle = { ...combatVehicleOf(combat, playerId), ...change }
  return { ...combat, vehicles: { ...combat.vehicles, [playerId]: vehicle } }
}

export function enemyById(combat: CombatState, enemyId: string): Enemy | undefined {
  return combat.enemies.find((enemy) => enemy.id === enemyId)
}

export function withEnemy(combat: CombatState, enemy: Enemy): CombatState {
  return {
    ...combat,
    enemies: combat.enemies.map((current) => (current.id === enemy.id ? enemy : current)),
  }
}

export function withoutEnemy(combat: CombatState, enemyId: string): CombatState {
  return { ...combat, enemies: combat.enemies.filter((enemy) => enemy.id !== enemyId) }
}

export function enemiesOwnedBy(combat: CombatState, playerId: string): Enemy[] {
  return combat.enemies.filter((enemy) => enemy.ownerId === playerId)
}

/** Ids are `e1`, `e2`, ... in spawn order, never reused in a session. */
export function enemyIdOf(number: number): string {
  return `e${number}`
}

export function inPhase(enemy: Enemy, phase: EnemyPhase, tick: number): Enemy {
  return { ...enemy, phase, phaseSinceTick: tick }
}

export type { HitArc }
