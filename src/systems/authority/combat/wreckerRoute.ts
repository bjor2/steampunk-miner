/**
 * The route home as tunnel wreckers see it (spec #111): each casing ring a vehicle's drill lays this
 * trip is remembered by its axis point once the `tunnel_wrecker` row is open on the planet, so a
 * player who never cases never meets one. A trip's end forgets the route with the rest of combat.
 *
 * A ring is gnawable while it still holds intact lining (grade 1 to 15), sits in a band the kind
 * lives in, no vehicle is within `ignoreVehicleTiles` of it and no other wrecker holds it.
 * Distances are integer mm squared, like every combat distance.
 */
import { CASING_RING_SPACING_MM } from '../../../constants/balance'
import { MM_PER_METRE } from '../../../constants/physics'
import { ECONOMY } from '../../economy/economy'
import { enemyDefOf } from '../../economy/enemyStats'
import type { RingPoint } from '../../vehicle/casingTrail'
import { tileOfMillimetres } from '../../vehicle/vehiclePose'
import { casingBandOfTile } from '../../world/casingBand'
import { hasIntactLining } from '../../world/casingBreach'
import { casingRingAround } from '../../world/casingLining'
import type { PlanetParams } from '../../world/planetParams'
import { withCombat, type AuthorityState } from '../authorityState'
import { isFeatureUnlocked } from '../featureUnlocks'
import { distanceSq, isWithinMm, type MillimetrePoint } from './combatGeometry'
import type { CombatState, Enemy, WreckerRoute } from './combatState'
import { vehicleTargetOf } from './vehicleTarget'

export const TUNNEL_WRECKER = 'tunnel_wrecker'

const { ignoreVehicleTiles } = ECONOMY.enemies.tunnelWrecker
const MM_PER_TILE = MM_PER_METRE
/** Rings further back than an enemy may stray from its vehicle (48 tiles) are out of its reach. */
const MAX_REMEMBERED_RINGS =
  (ECONOMY.enemies.combat.despawnTiles * MM_PER_TILE) / CASING_RING_SPACING_MM

const NO_ROUTE: WreckerRoute = { rings: [], nextWreckerTick: 0 }

/** A ring a wrecker may go for, with the band it sits in (its tier and `ring_gnawed` band). */
export interface GnawableRing {
  point: RingPoint
  band: number
}

export function routeOf(combat: CombatState, playerId: string): WreckerRoute {
  return combat.routes[playerId] ?? NO_ROUTE
}

/** The ring just laid joins the vehicle's route, if wreckers live on this planet and it holds lining. */
export function rememberLinedRing(
  state: AuthorityState,
  playerId: string,
  point: RingPoint,
): AuthorityState {
  if (!isFeatureUnlocked(state, TUNNEL_WRECKER)) return state
  if (!hasIntactLining(state.world, ringAt(point))) return state
  const route = routeOf(state.combat, playerId)
  const rings = [...route.rings, point].slice(-MAX_REMEMBERED_RINGS)
  return withCombat(state, withRoute(state.combat, playerId, { ...route, rings }))
}

/** One wrecker fled or died: the next may come `respawnTicks` later. */
export function withWreckerGone(combat: CombatState, playerId: string, tick: number): CombatState {
  const nextWreckerTick = tick + ECONOMY.enemies.tunnelWrecker.respawnTicks
  return withRoute(combat, playerId, { ...routeOf(combat, playerId), nextWreckerTick })
}

/** A trip's end: the route behind the vehicle is no longer its way home. */
export function withoutRoute(combat: CombatState, playerId: string): CombatState {
  if (combat.routes[playerId] === undefined) return combat
  const routes = Object.fromEntries(Object.entries(combat.routes).filter(([id]) => id !== playerId))
  return { ...combat, routes }
}

/** The vehicle's newest gnawable ring: the first stretch of its route out of every vehicle's sight. */
export function newestGnawableRing(
  state: AuthorityState,
  params: PlanetParams,
  playerId: string,
  tick: number,
): GnawableRing | null {
  const rings = [...routeOf(state.combat, playerId).rings].reverse()
  return firstGnawable(state, params, rings, null, tick)
}

/** The gnawable ring nearest the wrecker on its vehicle's route; ties keep the route's order. */
export function nearestGnawableRing(
  state: AuthorityState,
  params: PlanetParams,
  wrecker: Enemy,
  tick: number,
): GnawableRing | null {
  const rings = [...routeOf(state.combat, wrecker.ownerId).rings]
  const byDistance = rings
    .map((point, order) => ({ point, order, distance: distanceSq(wrecker, millimetresOf(point)) }))
    .sort((a, b) => a.distance - b.distance || a.order - b.order)
    .map(({ point }) => point)
  return firstGnawable(state, params, byDistance, wrecker.id, tick)
}

/** Whether `wrecker` may go on gnawing its ring this tick. */
export function isStillGnawable(
  state: AuthorityState,
  params: PlanetParams,
  wrecker: Enemy,
  tick: number,
): boolean {
  return wrecker.ring !== null && gnawableOf(state, params, wrecker.ring, wrecker.id, tick) !== null
}

/** Every vehicle out on a trip, where it is at this tick, in player id order. */
export function vehiclePositionsOf(state: AuthorityState, tick: number): MillimetrePoint[] {
  return Object.keys(state.players)
    .sort()
    .flatMap((playerId) => {
      const target = vehicleTargetOf(state, playerId, tick)
      return target === null ? [] : [target.position]
    })
}

export function isAnyVehicleWithin(
  state: AuthorityState,
  point: MillimetrePoint,
  tiles: number,
  tick: number,
): boolean {
  return vehiclePositionsOf(state, tick).some((vehicle) =>
    isWithinMm(vehicle, point, tiles * MM_PER_TILE),
  )
}

export function millimetresOf(point: RingPoint): MillimetrePoint {
  return { x: point.xMm, y: point.yMm }
}

function firstGnawable(
  state: AuthorityState,
  params: PlanetParams,
  points: readonly RingPoint[],
  wreckerId: string | null,
  tick: number,
): GnawableRing | null {
  for (const point of points) {
    const ring = gnawableOf(state, params, point, wreckerId, tick)
    if (ring !== null) return ring
  }
  return null
}

function gnawableOf(
  state: AuthorityState,
  params: PlanetParams,
  point: RingPoint,
  wreckerId: string | null,
  tick: number,
): GnawableRing | null {
  const band = bandOfRing(params, point)
  const isGnawable =
    enemyDefOf(TUNNEL_WRECKER).bands.includes(band) &&
    !isHeldByAnotherWrecker(state.combat, point, wreckerId) &&
    !isAnyVehicleWithin(state, millimetresOf(point), ignoreVehicleTiles, tick) &&
    hasIntactLining(state.world, ringAt(point))
  return isGnawable ? { point, band } : null
}

function bandOfRing(params: PlanetParams, point: RingPoint): number {
  const tile = tileOfMillimetres(point.xMm, point.yMm)
  return casingBandOfTile(params, tile.tx, tile.ty)
}

function isHeldByAnotherWrecker(
  combat: CombatState,
  point: RingPoint,
  wreckerId: string | null,
): boolean {
  return combat.enemies.some((enemy) => enemy.id !== wreckerId && isSameRing(enemy.ring, point))
}

function isSameRing(held: RingPoint | null, point: RingPoint): boolean {
  return held !== null && held.xMm === point.xMm && held.yMm === point.yMm
}

function ringAt(point: RingPoint) {
  return casingRingAround(point.xMm, point.yMm)
}

function withRoute(combat: CombatState, playerId: string, route: WreckerRoute): CombatState {
  return { ...combat, routes: { ...combat.routes, [playerId]: route } }
}
