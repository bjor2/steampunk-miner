/**
 * The combat part of the session snapshot (#11 section 5): the same plain JSON as the state, with
 * each enemy's health and pending drill damage, and each vehicle's unlogged gun damage, as canonical
 * strings. A dock leaves no enemies, so a checkpoint taken there carries none (#9) and no wrecker
 * route (#111); a debug or co-op join snapshot mid-fight carries them.
 * Reading checks the shape; the digest check in `sessionSnapshot.ts` catches wrong values.
 */
import { ENEMY_KINDS, type EnemyKind } from '../../economy/economyDefinition'
import { fromCanonical, isNonNegativeMoneyText, toCanonical } from '../../money'
import { isJsonObject, isWholeNumber } from '../payloadFields'
import type {
  CombatState,
  CombatVehicle,
  Enemy,
  EnemyPhase,
  PendingGunHit,
  WreckerRoute,
} from './combatState'

type PortableEnemy = Omit<Enemy, 'health' | 'pendingDrill'> & {
  health: string
  pendingDrill: { amount: string; ticks: number }
}

type PortableGunHit = Omit<PendingGunHit, 'damage'> & { damage: string }

type PortableCombatVehicle = Omit<CombatVehicle, 'pendingGunHits'> & {
  pendingGunHits: PortableGunHit[]
}

export type PortableCombat = Omit<CombatState, 'enemies' | 'vehicles'> & {
  enemies: PortableEnemy[]
  vehicles: Record<string, PortableCombatVehicle>
}

const ENEMY_PHASES: readonly EnemyPhase[] = [
  'idle',
  'approach',
  'windup',
  'lunge',
  'recoil',
  'pinned',
  'seek',
  'gnaw',
  'flee',
]
const WHOLE_FIELDS = ['nextEnemyNumber'] as const
const ENEMY_WHOLE_FIELDS = ['tier', 'phaseSinceTick', 'readyTick'] as const
const ENEMY_INTEGER_FIELDS = ['x', 'y'] as const

export function portableCombatOf(combat: CombatState): PortableCombat {
  return {
    ...combat,
    enemies: combat.enemies.map(portableEnemyOf),
    vehicles: mapValues(combat.vehicles, portableCombatVehicleOf),
  }
}

export function combatOfPortable(portable: PortableCombat): CombatState {
  return {
    ...portable,
    enemies: portable.enemies.map(enemyOfPortable),
    vehicles: mapValues(portable.vehicles, combatVehicleOfPortable),
  }
}

export function portableCombatProblems(combat: unknown, path: string): string[] {
  if (!isJsonObject(combat)) return [`${path} must be an object`]
  return [
    ...WHOLE_FIELDS.filter((name) => !isWholeNumber(combat[name])).map(
      (name) => `${path}.${name} must be a whole number`,
    ),
    ...(typeof combat.isFrozen === 'boolean' ? [] : [`${path}.isFrozen must be a boolean`]),
    ...(isStringList(combat.usedSpawnPointIds) ? [] : [`${path}.usedSpawnPointIds is malformed`]),
    ...(isKindList(combat.encounteredKinds) ? [] : [`${path}.encounteredKinds is malformed`]),
    ...vehiclesProblems(combat.vehicles, `${path}.vehicles`),
    ...enemiesProblems(combat.enemies, `${path}.enemies`),
    ...routesProblems(combat.routes, `${path}.routes`),
  ]
}

function portableEnemyOf(enemy: Enemy): PortableEnemy {
  return {
    ...enemy,
    health: toCanonical(enemy.health),
    pendingDrill: { ...enemy.pendingDrill, amount: toCanonical(enemy.pendingDrill.amount) },
  }
}

function enemyOfPortable(enemy: PortableEnemy): Enemy {
  return {
    ...enemy,
    health: fromCanonical(enemy.health),
    pendingDrill: { ...enemy.pendingDrill, amount: fromCanonical(enemy.pendingDrill.amount) },
  }
}

function portableCombatVehicleOf(vehicle: CombatVehicle): PortableCombatVehicle {
  return {
    ...vehicle,
    pendingGunHits: vehicle.pendingGunHits.map((hit) => ({
      ...hit,
      damage: toCanonical(hit.damage),
    })),
  }
}

function combatVehicleOfPortable(vehicle: PortableCombatVehicle): CombatVehicle {
  return {
    ...vehicle,
    pendingGunHits: vehicle.pendingGunHits.map((hit) => ({
      ...hit,
      damage: fromCanonical(hit.damage),
    })),
  }
}

function mapValues<From, To>(
  record: Readonly<Record<string, From>>,
  map: (value: From) => To,
): Record<string, To> {
  return Object.fromEntries(Object.entries(record).map(([key, value]) => [key, map(value)]))
}

function vehiclesProblems(vehicles: unknown, path: string): string[] {
  if (!isJsonObject(vehicles)) return [`${path} must be an object`]
  return Object.entries(vehicles)
    .filter(([, vehicle]) => !isPortableCombatVehicle(vehicle))
    .map(([id]) => `${path}.${id} is malformed`)
}

function isPortableCombatVehicle(vehicle: unknown): boolean {
  return (
    isJsonObject(vehicle) &&
    isWholeNumber(vehicle.reportTick) &&
    isStringList(vehicle.frontAtReport) &&
    isWholeNumber(vehicle.previousReportTick) &&
    isStringList(vehicle.frontAtPreviousReport) &&
    (vehicle.lastHitTick === null || isWholeNumber(vehicle.lastHitTick)) &&
    isWholeNumber(vehicle.gunReadyTick) &&
    Array.isArray(vehicle.pendingGunHits) &&
    vehicle.pendingGunHits.every(isPortableGunHit)
  )
}

function isPortableGunHit(hit: unknown): boolean {
  return (
    isJsonObject(hit) &&
    typeof hit.enemyId === 'string' &&
    isNonNegativeMoneyText(hit.damage) &&
    isWholeNumber(hit.shots)
  )
}

function enemiesProblems(enemies: unknown, path: string): string[] {
  if (!Array.isArray(enemies)) return [`${path} must be a list`]
  return enemies.flatMap((enemy, index) => enemyProblems(enemy, `${path}[${index}]`))
}

function enemyProblems(enemy: unknown, path: string): string[] {
  if (!isJsonObject(enemy)) return [`${path} must be an object`]
  const isValid =
    ['id', 'spawnPointId', 'ownerId'].every((name) => typeof enemy[name] === 'string') &&
    ENEMY_KINDS.includes(enemy.kind as EnemyKind) &&
    ENEMY_PHASES.includes(enemy.phase as EnemyPhase) &&
    ENEMY_WHOLE_FIELDS.every((name) => isWholeNumber(enemy[name])) &&
    ENEMY_INTEGER_FIELDS.every((name) => Number.isSafeInteger(enemy[name])) &&
    isNonNegativeMoneyText(enemy.health) &&
    isIntegerStep(enemy.step) &&
    isPortablePendingDrill(enemy.pendingDrill) &&
    (enemy.ring === null || isRingPoint(enemy.ring))
  return isValid ? [] : [`${path} is malformed`]
}

/** Each vehicle's lined route (#111): its ring axis points and the next wrecker's tick. */
function routesProblems(routes: unknown, path: string): string[] {
  if (!isJsonObject(routes)) return [`${path} must be an object`]
  return Object.entries(routes)
    .filter(([, route]) => !isPortableRoute(route))
    .map(([id]) => `${path}.${id} is malformed`)
}

function isPortableRoute(route: unknown): route is WreckerRoute {
  return (
    isJsonObject(route) &&
    Array.isArray(route.rings) &&
    route.rings.every(isRingPoint) &&
    isWholeNumber(route.nextWreckerTick)
  )
}

function isRingPoint(point: unknown): boolean {
  return isJsonObject(point) && Number.isSafeInteger(point.xMm) && Number.isSafeInteger(point.yMm)
}

function isIntegerStep(step: unknown): boolean {
  return isJsonObject(step) && Number.isSafeInteger(step.x) && Number.isSafeInteger(step.y)
}

function isPortablePendingDrill(pending: unknown): boolean {
  return (
    isJsonObject(pending) && isNonNegativeMoneyText(pending.amount) && isWholeNumber(pending.ticks)
  )
}

function isStringList(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string')
}

function isKindList(value: unknown): value is EnemyKind[] {
  return Array.isArray(value) && value.every((item) => ENEMY_KINDS.includes(item as EnemyKind))
}
