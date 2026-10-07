/**
 * The death-replay breaker (#198, option c of Systems' call on T9 #137). Every tow ends the trip
 * and frees each spawn point the trip woke (#9), so a trip that killed the vehicle, played again
 * by the same vehicle, meets the same enemies in the same order and dies the same way (#130, T7
 * #131). After the second death on one route the bot retreats to sell: it closes that route, and
 * every deeper one down the same shaft, and mines the bands above it until the vehicle has
 * changed (a level bought with what it sold), so the next try is no replay of the trip that died.
 *
 * A route is the trip's goal: one ore band, or the core below them all. The other way out the
 * ticket names, a new shaft column, was probed on P8–P10 at on-curve levels: a fresh shaft and core
 * take about 30 minutes, and from some columns lava ends every core gallery, which would stall the
 * run. Only on the attrition planets (`botAttrition.ts`).
 */
import type { DomainEvent } from '../authority/domainEvent'
import { UPGRADE_IDS } from '../economy/economyDefinition'
import type { UpgradeLevels } from '../economy/vehicleStats'
import { isAttritionPlanet } from './botAttrition'
import type { BotPlanet } from './botPilot'
import type { BotSession } from './botSession'
import type { TripGoal } from './tripGoal'

/** #198: "after 2 deaths on the same route". */
const DEATHS_PER_ROUTE = 2
/** The core lies below band 5, as in `casingShortBand` (#41). */
const CORE_DEPTH = 6

/** Routes from `depth` down are closed while the vehicle has the levels it died with. */
interface ClosedRoutes {
  depth: number
  levels: UpgradeLevels
}

/** The deaths per route on the planet, and the routes the bot has retreated from. */
export interface RouteDeaths {
  /** Deaths since the route last closed, by the depth of the trip's goal. */
  byDepth: Map<number, number>
  closed: ClosedRoutes | null
}

export function noRouteDeaths(): RouteDeaths {
  return { byDepth: new Map(), closed: null }
}

/** Counts a trip's death against its route, and closes the route on its second. */
export function breakDeathReplay(
  session: BotSession,
  planet: BotPlanet,
  goal: TripGoal,
  tripEvents: readonly DomainEvent[],
): void {
  if (!isCountedDeath(session, tripEvents)) return
  recordRouteDeath(planet.routeDeaths, depthOf(goal))
  closeWhenReplaying(session, planet.routeDeaths, depthOf(goal))
}

/**
 * The deepest band an ore trip may go to while a route is closed, or null when every route is
 * open: none closed, or the vehicle has changed since the deaths that closed them.
 */
export function deepestOpenBand(planet: BotPlanet, levels: UpgradeLevels): number | null {
  const { closed } = planet.routeDeaths
  if (closed === null || !isSameVehicle(closed.levels, levels)) return null
  return closed.depth - 1
}

function isCountedDeath(session: BotSession, tripEvents: readonly DomainEvent[]): boolean {
  return isAttritionPlanet(session.state().planet.index) && hasDied(tripEvents)
}

function hasDied(tripEvents: readonly DomainEvent[]): boolean {
  return tripEvents.some((event) => event.type === 'VehicleDestroyed')
}

function depthOf(goal: TripGoal): number {
  return goal.kind === 'core' ? CORE_DEPTH : goal.band
}

function recordRouteDeath(deaths: RouteDeaths, depth: number): void {
  deaths.byDepth.set(depth, (deaths.byDepth.get(depth) ?? 0) + 1)
}

/** A route closes from its depth down; one closed already for this vehicle may close shallower. */
function closeWhenReplaying(session: BotSession, deaths: RouteDeaths, depth: number): void {
  if ((deaths.byDepth.get(depth) ?? 0) < DEATHS_PER_ROUTE) return
  const { levels } = session.vehicle()
  deaths.byDepth.delete(depth)
  deaths.closed = { depth: shallowerClosedDepth(deaths.closed, levels, depth), levels }
}

function shallowerClosedDepth(
  closed: ClosedRoutes | null,
  levels: UpgradeLevels,
  depth: number,
): number {
  return closed !== null && isSameVehicle(closed.levels, levels)
    ? Math.min(closed.depth, depth)
    : depth
}

function isSameVehicle(before: UpgradeLevels, now: UpgradeLevels): boolean {
  return UPGRADE_IDS.every((id) => before[id] === now[id])
}
