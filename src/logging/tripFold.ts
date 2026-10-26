/**
 * The pacing bot's per-trip fold (ticket 918; #916's GD lock, read by #908's trip gate: 6-15 trips
 * a planet, median trip at most 5 min, none over 8 min on P1-P5). Folded from the bot's steps beside
 * the economy trace (`economyTrace.ts`), derived and never written into the log (#11 section 3), so
 * goldens and the trace's own rows stay byte-identical. One record per trip:
 *
 * - **start and end tick**: a trip starts on the first step the rig is active off the pad, and
 *   ends at the dock, the rescue, or the step its hold was left behind off the pad (a Cache Crate
 *   drop, ticket 850), where the next trip starts at once;
 * - **endCause**: one of six (`tripEndCause.ts`);
 * - **deepest band**: the deepest band it cut a cell in or stood in, band 1 when neither;
 * - **cells cut**: every `TileDestroyed` on the trip;
 * - **sell value**: what its hold sold for after the dock that ended it, until the next trip ends;
 *   a rescue or a crate drop sells nothing (the crate's ore sells with the trip that fetches it);
 * - **fuel used**: every drop of the tank on the trip, in energy quanta.
 *
 * A trip that docks having cut nothing and carrying nothing (a hop from bay to bay) is no trip.
 * A step that applied a debug command is skipped whole (#11 section 4).
 */
import type { AuthorityState } from '../systems/authority/authorityState'
import type { DomainEvent } from '../systems/authority/domainEvent'
import { planetParamsOf } from '../systems/authority/planetOfState'
import { add, fromCanonical, ZERO_MONEY, type Money } from '../systems/money'
import { cargoUnitsOf } from '../systems/vehicle/vehicleState'
import { depthTilesOfPose, tileOfPose } from '../systems/vehicle/vehiclePose'
import { bandOfTile } from '../systems/world/planetGeometry'
import {
  dockedEndCauseOf,
  turnBackReadingOf,
  UNWARNED,
  type TripEndCause,
  type TurnBackReading,
} from './tripEndCause'

export interface TripRecord {
  planet: number
  startTick: number
  endTick: number
  endCause: TripEndCause
  deepestBand: number
  cellsCut: number
  sellValue: Money
  fuelUsedQuanta: number
}

/** The trip under way. */
interface OpenTrip {
  startTick: number
  deepestBand: number | null
  /** The deepest depth the rig stood at below the surface; null while it stood at none. */
  deepestDepth: number | null
  turnBack: TurnBackReading
  cellsCut: number
  fuelUsedQuanta: number
  lastEnergy: number
  lastCargoUnits: bigint
}

export interface TripFold {
  trips: TripRecord[]
  /** The planet the last folded step was on; 0 before the first. */
  planetIndex: number
  open: OpenTrip | null
  /** The ended trip whose hold is still being sold; null once a rescue or a crate drop ended one. */
  selling: TripRecord | null
}

const FIRST_BAND = 1

export function emptyTripFold(): TripFold {
  return { trips: [], planetIndex: 0, open: null, selling: null }
}

/** One bot step: the state after it and the events it answered, folded in place. */
export function foldTripStep(
  fold: TripFold,
  state: AuthorityState,
  playerId: string,
  events: readonly DomainEvent[],
): void {
  if (events.some(isDebugCommand)) return
  followPlanet(fold, state.planet.index)
  events.forEach((event) => foldTripEvent(fold, state, playerId, event))
  openTripOffPad(fold, state, playerId)
  followOpenTrip(fold, state, playerId)
}

/** A new planet starts with no trip under way and no hold being sold. */
function followPlanet(fold: TripFold, index: number): void {
  if (index === fold.planetIndex) return
  fold.planetIndex = index
  fold.open = null
  fold.selling = null
}

function foldTripEvent(
  fold: TripFold,
  state: AuthorityState,
  playerId: string,
  event: DomainEvent,
): void {
  if (event.type === 'ResourceSold') addSale(fold, fromCanonical(event.value))
  if (event.type === 'TileDestroyed') countCut(fold.open, state, event)
  if (event.type === 'DockEntered') endTripAtDock(fold, state, playerId, event.cargoUnits)
  if (event.type === 'RescueTriggered') endTripAs(fold, state.tick, 'death')
}

function addSale(fold: TripFold, value: Money): void {
  if (fold.selling !== null) fold.selling.sellValue = add(fold.selling.sellValue, value)
}

type TileDestroyedEvent = Extract<DomainEvent, { type: 'TileDestroyed' }>

function countCut(trip: OpenTrip | null, state: AuthorityState, cell: TileDestroyedEvent): void {
  const params = planetParamsOf(state.planet)
  if (trip === null || params === null) return
  trip.cellsCut += 1
  trip.deepestBand = deeperBandOf(trip.deepestBand, bandOfTile(params, cell.tx, cell.ty))
}

/** A dock ends the trip, unless it was a bay hop that cut nothing and brought nothing home. */
function endTripAtDock(
  fold: TripFold,
  state: AuthorityState,
  playerId: string,
  cargoUnits: bigint,
): void {
  const trip = fold.open
  if (trip === null) return
  if (trip.cellsCut === 0 && cargoUnits === 0n) {
    fold.open = null
    return
  }
  const cause = dockedEndCauseOf(state, playerId, cargoUnits, trip.turnBack)
  fold.selling = endTripAs(fold, state.tick, cause)
}

/** Records the open trip as ended by `cause`; null when none was under way. */
function endTripAs(fold: TripFold, tick: number, cause: TripEndCause): TripRecord | null {
  const trip = fold.open
  fold.open = null
  fold.selling = null
  if (trip === null) return null
  const record = tripRecordOf(fold.planetIndex, trip, tick, cause)
  fold.trips.push(record)
  return record
}

function tripRecordOf(
  planet: number,
  trip: OpenTrip,
  endTick: number,
  endCause: TripEndCause,
): TripRecord {
  return {
    planet,
    startTick: trip.startTick,
    endTick,
    endCause,
    deepestBand: trip.deepestBand ?? FIRST_BAND,
    cellsCut: trip.cellsCut,
    sellValue: ZERO_MONEY,
    fuelUsedQuanta: trip.fuelUsedQuanta,
  }
}

function openTripOffPad(fold: TripFold, state: AuthorityState, playerId: string): void {
  if (fold.open !== null || state.players[playerId].vehicle.mode !== 'active') return
  fold.open = newTripAt(state, playerId)
}

function newTripAt(state: AuthorityState, playerId: string): OpenTrip {
  const vehicle = state.players[playerId].vehicle
  return {
    startTick: state.tick,
    deepestBand: null,
    deepestDepth: null,
    turnBack: UNWARNED,
    cellsCut: 0,
    fuelUsedQuanta: 0,
    lastEnergy: vehicle.energy,
    lastCargoUnits: cargoUnitsOf(vehicle.cargo),
  }
}

/** Fuel, depth and the hold of the trip under way; a hold left behind ends it as a crate. */
function followOpenTrip(fold: TripFold, state: AuthorityState, playerId: string): void {
  const trip = fold.open
  if (trip === null) return
  followFuel(trip, state.players[playerId].vehicle.energy)
  followDepth(trip, state, playerId)
  if (isHoldLeftBehind(trip, state, playerId)) leaveHoldInCrate(fold, state, playerId)
  else trip.lastCargoUnits = cargoUnitsOf(state.players[playerId].vehicle.cargo)
}

function followFuel(trip: OpenTrip, energy: number): void {
  trip.fuelUsedQuanta += Math.max(0, trip.lastEnergy - energy)
  trip.lastEnergy = energy
}

/** The deepest band the rig stood in, and its warnings on the last step at its deepest depth. */
function followDepth(trip: OpenTrip, state: AuthorityState, playerId: string): void {
  const depth = rigDepthOf(state, playerId)
  if (depth === null) return
  trip.deepestBand = deeperBandOf(trip.deepestBand, depth.band)
  if (trip.deepestDepth !== null && depth.depthTiles < trip.deepestDepth) return
  trip.deepestDepth = depth.depthTiles
  trip.turnBack = turnBackReadingOf(state, playerId, depth.depthTiles)
}

/** How deep below the surface the rig stands and in which band; null at or above the surface. */
function rigDepthOf(
  state: AuthorityState,
  playerId: string,
): { depthTiles: number; band: number } | null {
  const pose = state.players[playerId].vehicle.pose
  const params = planetParamsOf(state.planet)
  if (pose === null || params === null) return null
  const depthTiles = depthTilesOfPose(params, pose)
  if (depthTiles <= 0) return null
  const tile = tileOfPose(pose)
  return { depthTiles, band: bandOfTile(params, tile.tx, tile.ty) }
}

/** The hold emptied while the rig was active off the pad: only a dropped crate does that. */
function isHoldLeftBehind(trip: OpenTrip, state: AuthorityState, playerId: string): boolean {
  const vehicle = state.players[playerId].vehicle
  return vehicle.mode === 'active' && trip.lastCargoUnits > 0n && cargoUnitsOf(vehicle.cargo) === 0n
}

function leaveHoldInCrate(fold: TripFold, state: AuthorityState, playerId: string): void {
  endTripAs(fold, state.tick, 'cache_crate')
  fold.open = newTripAt(state, playerId)
}

function deeperBandOf(known: number | null, band: number): number {
  return known === null ? band : Math.max(known, band)
}

function isDebugCommand(event: DomainEvent): boolean {
  return event.type === 'DebugCommandApplied'
}
