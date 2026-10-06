/**
 * When a tunnel wrecker comes (spec #111 Spawn, Systems' numbers): on a planet where the
 * `tunnel_wrecker` row is open, a vehicle out on a trip with at least `minLinedRings` rings on its
 * route, fewer wreckers than its planet's cap and the `respawnTicks` since the last one fled or died
 * calls one to the newest ring of its route that no vehicle is within `ignoreVehicleTiles` of. It
 * comes out of the rock at that ring, logged as `wrecker_spawned` with the ring and its band, and
 * its tier is the band's on the standard curve.
 */
import { ECONOMY } from '../../economy/economy'
import type { WreckerCap } from '../../economy/economyDefinition'
import { enemyTier } from '../../economy/enemyStats'
import { withCombat, type AuthorityState } from '../authorityState'
import { chainEffects, unchanged, type RuleEffect } from '../commandRule'
import { isFeatureUnlocked } from '../featureUnlocks'
import { planetParamsOf } from '../planetOfState'
import { ringIdOf } from '../casingGnaw'
import { enemiesOwnedBy, enemyIdOf, inPhase, withEnemy, type CombatState } from './combatState'
import { hasRoomForEnemy, spawnEnemy } from './enemyRoster'
import { vehicleTargetOf } from './vehicleTarget'
import {
  millimetresOf,
  newestGnawableRing,
  routeOf,
  TUNNEL_WRECKER,
  type GnawableRing,
} from './wreckerRoute'

/** A wrecker comes to the route, never from a spawn point, so no point is ever used up by it. */
export const ROUTE_SPAWN_POINT_ID = 'route'

const { minLinedRings, maxAliveByPlanet } = ECONOMY.enemies.tunnelWrecker

export function callWrecker(state: AuthorityState, playerId: string, tick: number): RuleEffect {
  const ring = ringCallingAWrecker(state, playerId, tick)
  if (ring === null) return unchanged(state)
  return chainEffects(state, [
    (current) => spawnWreckerAt(current, playerId, ring, tick),
    (current) => setWreckerOnRing(current, ring),
  ])
}

/** The most wreckers one vehicle's route draws on this planet (0 before the first row's planet). */
export function wreckerCapOf(planetIndex: number): number {
  return maxAliveByPlanet
    .filter((cap: WreckerCap) => cap.from <= planetIndex)
    .reduce((_, cap) => cap.n, 0)
}

export function wreckersOwnedBy(combat: CombatState, playerId: string): number {
  return enemiesOwnedBy(combat, playerId).filter((enemy) => enemy.kind === TUNNEL_WRECKER).length
}

function ringCallingAWrecker(
  state: AuthorityState,
  playerId: string,
  tick: number,
): GnawableRing | null {
  const params = planetParamsOf(state.planet)
  if (params === null || !isWreckerDue(state, playerId, tick)) return null
  return newestGnawableRing(state, params, playerId, tick)
}

function isWreckerDue(state: AuthorityState, playerId: string, tick: number): boolean {
  const route = routeOf(state.combat, playerId)
  return (
    isFeatureUnlocked(state, TUNNEL_WRECKER) &&
    vehicleTargetOf(state, playerId, tick) !== null &&
    route.rings.length >= minLinedRings &&
    tick >= route.nextWreckerTick &&
    wreckersOwnedBy(state.combat, playerId) < wreckerCapOf(state.planet.index) &&
    hasRoomForEnemy(state.combat, playerId)
  )
}

function spawnWreckerAt(
  state: AuthorityState,
  playerId: string,
  ring: GnawableRing,
  tick: number,
): RuleEffect {
  const enemyId = enemyIdOf(state.combat.nextEnemyNumber)
  const arrival = {
    kind: TUNNEL_WRECKER,
    tier: enemyTier(state.planet.index, ring.band),
    spawnPointId: ROUTE_SPAWN_POINT_ID,
    ownerId: playerId,
    position: millimetresOf(ring.point),
  } as const
  const spawned = spawnEnemy(state, arrival, tick)
  return {
    state: spawned.state,
    events: [
      ...spawned.events,
      { type: 'WreckerSpawned', enemyId, ring: ringIdOf(ring.point), band: ring.band },
    ],
  }
}

/** The newest enemy is the wrecker just spawned: it starts seeking the ring it came to. */
function setWreckerOnRing(state: AuthorityState, ring: GnawableRing): RuleEffect {
  const wrecker = state.combat.enemies[state.combat.enemies.length - 1]
  const seeking = { ...inPhase(wrecker, 'seek', wrecker.phaseSinceTick), ring: ring.point }
  return unchanged(withCombat(state, withEnemy(state.combat, seeking)))
}
