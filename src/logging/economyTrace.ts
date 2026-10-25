/**
 * The per-planet economy trace of a bot run (ticket 907; the GD lock of 25 Oct on the P3-P5 pacing
 * audit: diagnose first, never retune to pass a gate), folded from the bot's steps beside the
 * pacing tallies. It is derived and never written into the log (#11 section 3), so a run nobody
 * traces logs byte for byte as before. Per planet:
 *
 * - **arrival**: the tick and the money held on the planet's first played step;
 * - **income**: every sale's proceeds (`ResourceSold.value`), which the rows divide by the minutes;
 * - **asks**: the next useful upgrade (`economyTraceAsks.ts`) on arrival and after every track
 *   buy, its price, and the tick the wallet first covered it, or the tick a buy replaced it;
 * - **upgrades**: what was bought, by track or purchase;
 * - **deaths**: every rescue by cause (`economyTraceLabels.ts`);
 * - **trips**: each trip from dock to dock, by the deepest band it mined, and what its hold sold
 *   for until the next trip that mined something ended; a rescued trip sells 0. A trip that mined
 *   nothing (a hop from bay to bay: the pads of P3 on sit below the surface line) ends no trip.
 *
 * A step that applied a debug command (a scenario's set-up) is skipped whole (#11 section 4).
 */
import type { AuthorityState } from '../systems/authority/authorityState'
import type { DomainEvent } from '../systems/authority/domainEvent'
import { planetParamsOf } from '../systems/authority/planetOfState'
import { add, fromCanonical, ZERO_MONEY, type Money } from '../systems/money'
import { depthTilesOfPose, tileOfPose } from '../systems/vehicle/vehiclePose'
import { bandOfTile } from '../systems/world/planetGeometry'
import { openUpgradeAsk, settleUpgradeAsks, type UpgradeAsk } from './economyTraceAsks'
import { deathCauseOf, purchaseLabelOf } from './economyTraceLabels'

/** One trip: the deepest band it mined and what its hold sold for after the dock that ended it. */
export interface TripSale {
  band: number
  value: Money
  isRescued: boolean
}

const FIRST_BAND = 1

export interface PlanetEconomy {
  planet: number
  arrivalTick: number
  /** The tick of the last step played on the planet. */
  lastTick: number
  arrivalWallet: Money
  income: Money
  asks: UpgradeAsk[]
  /** Purchases by label (`drill_tip`, `casing`, `gun`, ...). */
  upgrades: Map<string, number>
  /** Rescues by cause (`hazard.<kind>`, `collapse`, `fuel`, `hull.<cause>`). */
  deaths: Map<string, number>
  trips: TripSale[]
}

/** The trip under way since the last dock or rescue. */
interface OpenTrip {
  /** The deepest band of a cell it broke; null while it broke none. */
  minedBand: number | null
  /** The deepest band the rig stood in, for a rescue that mined nothing. */
  poseBand: number | null
  /** The last hazard that drained the rig's energy on the trip, for a strand's cause. */
  drainedBy: string | null
}

export interface EconomyTrace {
  planets: Map<number, PlanetEconomy>
  /** The planet the last folded step was on; 0 before the first. */
  planetIndex: number
  trip: OpenTrip
  /** The ended trip whose hold is still being sold; null once a rescue lost it. */
  selling: TripSale | null
  /** What wrecked the rig, until the rescue that follows counts the death. */
  destroyedBy: string | null
}

export function emptyEconomyTrace(): EconomyTrace {
  return { planets: new Map(), planetIndex: 0, trip: newTrip(), selling: null, destroyedBy: null }
}

function newTrip(): OpenTrip {
  return { minedBand: null, poseBand: null, drainedBy: null }
}

/** One bot step: the state after it and the events it answered, folded in place. */
export function traceEconomyStep(
  trace: EconomyTrace,
  state: AuthorityState,
  playerId: string,
  events: readonly DomainEvent[],
): void {
  if (events.some(isDebugCommand)) return
  const planet = planetEconomyOf(trace, state, playerId)
  planet.lastTick = state.tick
  followTrip(trace, state, playerId)
  events.forEach((event) => traceEconomyEvent(trace, planet, state, event))
  settleUpgradeAsks(planet.asks, state, playerId, events)
}

function planetEconomyOf(
  trace: EconomyTrace,
  state: AuthorityState,
  playerId: string,
): PlanetEconomy {
  const index = state.planet.index
  if (index !== trace.planetIndex) leavePlanet(trace, index)
  const known = trace.planets.get(index)
  if (known !== undefined) return known
  const arrived = arrivedPlanetOf(state, playerId)
  trace.planets.set(index, arrived)
  return arrived
}

/** A new planet starts with no trip under way and no hold being sold. */
function leavePlanet(trace: EconomyTrace, index: number): void {
  trace.planetIndex = index
  trace.trip = newTrip()
  trace.selling = null
  trace.destroyedBy = null
}

function arrivedPlanetOf(state: AuthorityState, playerId: string): PlanetEconomy {
  return {
    planet: state.planet.index,
    arrivalTick: state.tick,
    lastTick: state.tick,
    arrivalWallet: state.players[playerId].wallet,
    income: ZERO_MONEY,
    asks: [openUpgradeAsk(state, playerId)],
    upgrades: new Map(),
    deaths: new Map(),
    trips: [],
  }
}

/** The trip's pose band follows the deepest band the rig stood in below the surface. */
function followTrip(trace: EconomyTrace, state: AuthorityState, playerId: string): void {
  const band = bandBelowSurfaceOf(state, playerId)
  if (band !== null) trace.trip.poseBand = deeperBandOf(trace.trip.poseBand, band)
}

/** The band of the tile the rig stands in, null at or above the surface. */
function bandBelowSurfaceOf(state: AuthorityState, playerId: string): number | null {
  const pose = state.players[playerId].vehicle.pose
  const params = planetParamsOf(state.planet)
  if (pose === null || params === null || depthTilesOfPose(params, pose) <= 0) return null
  const tile = tileOfPose(pose)
  return bandOfTile(params, tile.tx, tile.ty)
}

function traceEconomyEvent(
  trace: EconomyTrace,
  planet: PlanetEconomy,
  state: AuthorityState,
  event: DomainEvent,
): void {
  if (event.type === 'ResourceSold') addSale(trace, planet, fromCanonical(event.value))
  if (event.type === 'TileDestroyed') followMinedBand(trace.trip, state, event.tx, event.ty)
  if (event.type === 'DockEntered') endTripAtDock(trace, planet)
  if (event.type === 'HazardDrained') trace.trip.drainedBy = event.kind
  if (event.type === 'VehicleDestroyed') trace.destroyedBy = event.cause
  if (event.type === 'RescueTriggered') countRescue(trace, planet, event.cause)
  countPurchase(planet, purchaseLabelOf(event))
}

function followMinedBand(trip: OpenTrip, state: AuthorityState, tx: number, ty: number): void {
  const params = planetParamsOf(state.planet)
  if (params !== null) trip.minedBand = deeperBandOf(trip.minedBand, bandOfTile(params, tx, ty))
}

function deeperBandOf(known: number | null, band: number): number {
  return known === null ? band : Math.max(known, band)
}

function addSale(trace: EconomyTrace, planet: PlanetEconomy, value: Money): void {
  planet.income = add(planet.income, value)
  if (trace.selling !== null) trace.selling.value = add(trace.selling.value, value)
}

/** A dock ends a trip that mined something, whose hold the sales from now on are. */
function endTripAtDock(trace: EconomyTrace, planet: PlanetEconomy): void {
  const band = trace.trip.minedBand
  trace.trip = newTrip()
  if (band === null) return
  const sale: TripSale = { band, value: ZERO_MONEY, isRescued: false }
  planet.trips.push(sale)
  trace.selling = sale
}

/** A rescue ends the trip with its hold lost, at the band it mined, else the band it reached. */
function endTripAtRescue(trace: EconomyTrace, planet: PlanetEconomy): void {
  const band = trace.trip.minedBand ?? trace.trip.poseBand ?? FIRST_BAND
  planet.trips.push({ band, value: ZERO_MONEY, isRescued: true })
  trace.trip = newTrip()
  trace.selling = null
}

function countRescue(trace: EconomyTrace, planet: PlanetEconomy, cause: string): void {
  countInto(planet.deaths, deathCauseOf(cause, trace.destroyedBy, trace.trip.drainedBy))
  trace.destroyedBy = null
  endTripAtRescue(trace, planet)
}

function countPurchase(planet: PlanetEconomy, label: string | null): void {
  if (label !== null) countInto(planet.upgrades, label)
}

function countInto(counts: Map<string, number>, key: string): void {
  counts.set(key, (counts.get(key) ?? 0) + 1)
}

function isDebugCommand(event: DomainEvent): boolean {
  return event.type === 'DebugCommandApplied'
}
