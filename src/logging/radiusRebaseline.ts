/**
 * The extra rows of the R3 re-baseline under the radius rule (ticket 644; GD lock R3 on #302
 * 6306854642, its addendum 6306861669 and the Campaign Scaling room's rows on #644), folded from a
 * bot run's steps beside the drill pace tally (`drillPace.ts`), which already holds the planet
 * minutes, the felt speed and the drill + tip majors. Per planet: the sales from arrival to the
 * core (money per minute, the basis of p*), the wallet at core harvest (the travel fee share), and
 * the trip and climb ticks (G&V: the climb from a trip's deepest point back to the dock). Per hop:
 * the charge `travel_started` logged and the wallet it was paid from (the #648 clamp's rows).
 */
import type { AuthorityState } from '../systems/authority/authorityState'
import type { DomainEvent } from '../systems/authority/domainEvent'
import { planetParamsOf } from '../systems/authority/planetOfState'
import { add, fromCanonical, ZERO_MONEY, type Money } from '../systems/money'
import { depthTilesOfPose } from '../systems/vehicle/vehiclePose'

/** One planet's money and trips in one run. */
export interface PlanetRadiusPace {
  planet: number
  arrivalTick: number
  coreTick: number | null
  /** Sales from arrival to the core. */
  salesToCore: Money
  /** The wallet the step that completed the core left. */
  walletAtCore: Money | null
  /** Ticks of the trips closed on the planet, from leaving the surface to the next dock entry. */
  tripTicks: number
  /** Ticks of those trips from their deepest point back to the dock. */
  climbTicks: number
}

/** One hop: what `travel_started` charged and the wallet it was charged from. */
export interface TravelHop {
  fromPlanet: number
  cost: Money
  walletBefore: Money
}

interface OpenTrip {
  startTick: number
  deepestTiles: number
  deepestTick: number
}

export interface RadiusRebaselineTally {
  planets: Map<number, PlanetRadiusPace>
  hops: TravelHop[]
  trip: OpenTrip | null
}

export function emptyRadiusRebaselineTally(): RadiusRebaselineTally {
  return { planets: new Map(), hops: [], trip: null }
}

/** One bot step: the state after it and the events it answered, folded in place. */
export function tallyRadiusRebaselineStep(
  tally: RadiusRebaselineTally,
  state: AuthorityState,
  playerId: string,
  events: readonly DomainEvent[],
): void {
  const planet = planetPaceOf(tally, state.planet.index, state.tick)
  followTrip(tally, depthTilesOf(state, playerId), state.tick)
  events.forEach((event) => tallyEvent(tally, planet, state, playerId, event))
}

function planetPaceOf(tally: RadiusRebaselineTally, planet: number, tick: number) {
  const known = tally.planets.get(planet)
  if (known !== undefined) return known
  const fresh: PlanetRadiusPace = {
    planet,
    arrivalTick: tick,
    coreTick: null,
    salesToCore: ZERO_MONEY,
    walletAtCore: null,
    tripTicks: 0,
    climbTicks: 0,
  }
  tally.planets.set(planet, fresh)
  return fresh
}

function depthTilesOf(state: AuthorityState, playerId: string): number {
  const pose = state.players[playerId].vehicle.pose
  return pose === null ? 0 : depthTilesOfPose(planetParamsOf(state.planet), pose)
}

/** A trip opens below the surface; its deepest point moves to the last step seen at the most depth. */
function followTrip(tally: RadiusRebaselineTally, depthTiles: number, tick: number): void {
  if (depthTiles <= 0) return
  const trip = tally.trip
  if (trip === null) {
    tally.trip = { startTick: tick, deepestTiles: depthTiles, deepestTick: tick }
    return
  }
  if (depthTiles < trip.deepestTiles) return
  trip.deepestTiles = depthTiles
  trip.deepestTick = tick
}

function tallyEvent(
  tally: RadiusRebaselineTally,
  planet: PlanetRadiusPace,
  state: AuthorityState,
  playerId: string,
  event: DomainEvent,
): void {
  if (event.type === 'ResourceSold') tallySale(planet, event.value)
  if (event.type === 'CoreCompleted') completeCore(planet, state, playerId)
  if (event.type === 'DockEntered') closeTrip(tally, planet, state.tick)
  if (event.type === 'TravelStarted') tallyHop(tally, state, playerId, event)
}

function tallySale(planet: PlanetRadiusPace, value: string): void {
  if (planet.coreTick !== null) return
  planet.salesToCore = add(planet.salesToCore, fromCanonical(value))
}

function completeCore(planet: PlanetRadiusPace, state: AuthorityState, playerId: string): void {
  if (planet.coreTick !== null) return
  planet.coreTick = state.tick
  planet.walletAtCore = state.players[playerId].wallet
}

function closeTrip(tally: RadiusRebaselineTally, planet: PlanetRadiusPace, tick: number): void {
  const trip = tally.trip
  if (trip === null) return
  planet.tripTicks += tick - trip.startTick
  planet.climbTicks += tick - trip.deepestTick
  tally.trip = null
}

type TravelStartedEvent = Extract<DomainEvent, { type: 'TravelStarted' }>

/** The step's state is after the charge, so the wallet it came from is the wallet plus the cost. */
function tallyHop(
  tally: RadiusRebaselineTally,
  state: AuthorityState,
  playerId: string,
  event: TravelStartedEvent,
): void {
  const cost = fromCanonical(event.cost)
  const walletBefore = add(state.players[playerId].wallet, cost)
  tally.hops.push({ fromPlanet: event.fromPlanet, cost, walletBefore })
  tally.trip = null
}
