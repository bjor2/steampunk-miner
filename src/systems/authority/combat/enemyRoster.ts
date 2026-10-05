/**
 * Which enemies are active (decision #9 "How many"):
 *
 * - A spawn point activates when a vehicle out on a trip comes within 24 tiles of it, unless its
 *   enemy is already active or was killed this trip; nearest first, at most 6 per vehicle.
 * - An enemy despawns when its vehicle is more than 48 tiles away or back at the platform.
 * - Every dock and every tow ends the trip: the vehicle's enemies despawn and every used spawn
 *   point is free again, so nothing about enemies needs saving.
 * - The first enemy of each kind in a run logs `enemy_type_encountered`.
 */
import { MM_PER_METRE } from '../../../constants/physics'
import { ECONOMY } from '../../economy/economy'
import type { EnemyKind } from '../../economy/economyDefinition'
import { enemyHealth } from '../../economy/enemyStats'
import { vehicleOf, withCombat, type AuthorityState } from '../authorityState'
import { chainEffects, unchanged, type RuleEffect } from '../commandRule'
import type { DomainEventBody } from '../domainEvent'
import { planetParamsOf } from '../planetOfState'
import { distanceSq, isWithinMm, type MillimetrePoint } from './combatGeometry'
import {
  enemiesOwnedBy,
  enemyIdOf,
  NEW_COMBAT,
  NO_PENDING_DRILL,
  withoutEnemy,
  type CombatState,
  type Enemy,
} from './combatState'
import { spawnPointsWithin, spawnPositionOf, type SpawnPoint } from './spawnPoints'
import { vehicleTargetOf } from './vehicleTarget'

const { maxActivePerVehicle, activationTiles, despawnTiles } = ECONOMY.enemies.combat
const MM_PER_TILE = MM_PER_METRE

export interface EnemyArrival {
  kind: EnemyKind
  tier: number
  spawnPointId: string
  ownerId: string
  position: MillimetrePoint
}

export function spawnEnemy(state: AuthorityState, arrival: EnemyArrival, tick: number): RuleEffect {
  const { combat } = state
  const enemy: Enemy = {
    id: enemyIdOf(combat.nextEnemyNumber),
    kind: arrival.kind,
    tier: arrival.tier,
    spawnPointId: arrival.spawnPointId,
    ownerId: arrival.ownerId,
    x: arrival.position.x,
    y: arrival.position.y,
    health: enemyHealth(arrival.kind, arrival.tier),
    phase: 'idle',
    phaseSinceTick: tick,
    readyTick: tick,
    step: { x: 0, y: 0 },
    pendingDrill: NO_PENDING_DRILL,
  }
  return {
    state: withCombat(state, withSpawned(combat, enemy)),
    events: [
      {
        type: 'EnemySpawned',
        enemyId: enemy.id,
        kind: enemy.kind,
        tier: enemy.tier,
        spawnPointId: enemy.spawnPointId,
      },
      ...encounterEvents(combat, enemy.kind),
    ],
  }
}

export function hasRoomForEnemy(combat: CombatState, playerId: string): boolean {
  return enemiesOwnedBy(combat, playerId).length < maxActivePerVehicle
}

/** Spawn points near the vehicle come alive, nearest first, up to the per-vehicle cap. */
export function activateSpawnPoints(
  state: AuthorityState,
  playerId: string,
  tick: number,
): RuleEffect {
  const target = vehicleTargetOf(state, playerId, tick)
  const params = planetParamsOf(state.planet)
  if (target === null || params === null || !hasRoomForEnemy(state.combat, playerId)) {
    return unchanged(state)
  }
  const room = maxActivePerVehicle - enemiesOwnedBy(state.combat, playerId).length
  const points = freeSpawnPoints(
    state.combat,
    spawnPointsWithin(params, target.position.x, target.position.y, activationTiles),
  )
  return chainEffects(
    state,
    nearestFirst(points, target.position)
      .slice(0, room)
      .map(
        (point) => (current: AuthorityState) =>
          spawnEnemy(current, arrivalAt(point, playerId), tick),
      ),
  )
}

/** A dock or a tow: the vehicle's enemies leave, and every spawn point is free again (#9). */
export function endTrip(state: AuthorityState, playerId: string): RuleEffect {
  const left = despawnEnemies(state, enemiesOwnedBy(state.combat, playerId))
  return {
    state: withCombat(left.state, { ...left.state.combat, usedSpawnPointIds: [] }),
    events: left.events,
  }
}

export function despawnEnemies(state: AuthorityState, enemies: readonly Enemy[]): RuleEffect {
  const combat = enemies.reduce((current, enemy) => withoutEnemy(current, enemy.id), state.combat)
  return {
    state: withCombat(state, combat),
    events: enemies.map((enemy): DomainEventBody => ({
      type: 'EnemyDespawned',
      enemyId: enemy.id,
    })),
  }
}

/** Another planet is another world: no enemies, no used points; the run's encounters stay. */
export function combatOnNewPlanet(combat: CombatState): CombatState {
  return {
    ...NEW_COMBAT,
    isFrozen: combat.isFrozen,
    nextEnemyNumber: combat.nextEnemyNumber,
    encounteredKinds: combat.encounteredKinds,
  }
}

function withSpawned(combat: CombatState, enemy: Enemy): CombatState {
  return {
    ...combat,
    nextEnemyNumber: combat.nextEnemyNumber + 1,
    enemies: [...combat.enemies, enemy],
    encounteredKinds: combat.encounteredKinds.includes(enemy.kind)
      ? combat.encounteredKinds
      : [...combat.encounteredKinds, enemy.kind],
  }
}

function encounterEvents(combat: CombatState, kind: EnemyKind): DomainEventBody[] {
  return combat.encounteredKinds.includes(kind) ? [] : [{ type: 'EnemyTypeEncountered', kind }]
}

function freeSpawnPoints(combat: CombatState, points: readonly SpawnPoint[]): SpawnPoint[] {
  const taken = new Set([
    ...combat.usedSpawnPointIds,
    ...combat.enemies.map((enemy) => enemy.spawnPointId),
  ])
  return points.filter((point) => !taken.has(point.id))
}

/** Nearest first; equal distances keep id order, so the pick never depends on anything else. */
function nearestFirst(points: readonly SpawnPoint[], from: MillimetrePoint): SpawnPoint[] {
  return [...points].sort(
    (a, b) =>
      distanceSq(from, spawnPositionOf(a.tile)) - distanceSq(from, spawnPositionOf(b.tile)) ||
      (a.id < b.id ? -1 : 1),
  )
}

function arrivalAt(point: SpawnPoint, ownerId: string): EnemyArrival {
  return {
    kind: point.kind,
    tier: point.tier,
    spawnPointId: point.id,
    ownerId,
    position: spawnPositionOf(point.tile),
  }
}

/** Its vehicle went home or drew more than 48 tiles away: it leaves the simulation. */
export function isStray(state: AuthorityState, enemy: Enemy, tick: number): boolean {
  if (vehicleOf(state, enemy.ownerId).mode === 'docked') return true
  const target = vehicleTargetOf(state, enemy.ownerId, tick)
  return target !== null && !isWithinMm(target.position, enemy, despawnTiles * MM_PER_TILE)
}
