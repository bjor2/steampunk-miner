/**
 * A bot run's trips priced per cell (ticket 535, Systems 6226531099 and 6228669500 on #514 and
 * #529, "the offline per-cell energy figure per trip"): the pacing bot cuts with `drillTile` on
 * the whole-tick clock, so its own energy and `tank_empty` are no evidence for the player path,
 * whose pose reports are charged on the density they remove at the swept price since ticket 535.
 * Each trip (from the start or an undock to the next dock or tow) is logged with the energy the
 * bot was charged beside the per-cell figure, the swept cut's price for the same cells: each
 * broken cell's drill time in sub-steps of its drill quantum (ticket 558) at the drill the vehicle
 * had, priced by `cellDigEnergyOf`,
 * at the drill's whole share. The margin is the tank over that figure; Systems asks for at least
 * 1.138 on every trip.
 *
 * A fold over the bot session's batches (`LoggedRunOptions.watchEvents`): each batch hands over the
 * state after it, so a batch's broken cells are priced on the state the batch before left, where
 * they still stood. Derived data only; nothing is written into the run log.
 */
import { BASIS_POINTS } from '../constants/balance'
import { vehicleOf, type AuthorityState } from '../systems/authority/authorityState'
import { cellDigEnergyOf } from '../systems/authority/cellDigEnergy'
import type { DomainEvent } from '../systems/authority/domainEvent'
import { drillSubStepsOfCells } from '../systems/authority/groundDrill'
import { heatThrottledDrill } from '../systems/authority/heatRules'
import { shockTicksFor } from '../systems/authority/magnetic/electrifiedShock'
import { planetParamsOf } from '../systems/authority/planetOfState'
import { drillQuantumAt } from '../systems/authority/stepBoundRead'
import { energyMaxQuantaOf } from '../systems/vehicle/vehicleState'
import type { TilePoint } from '../systems/world/tileGrid'
import { materialCellAt } from '../systems/world/worldState'

/** Systems' line on the player path: the tank over a trip's per-cell energy (6226531099, 6228669500). */
export const TRIP_TANK_MARGIN_FLOOR = 1.138

export interface TripCellEnergy {
  planet: number
  startTick: number
  endTick: number
  /** How the trip ended: `dock`, `rescue`, or `open` when the run ended first. */
  ending: string
  /** The tank's capacity in quanta at the trip's start. */
  tankQuanta: number
  /** The energy the bot was charged over the trip, in quanta. */
  chargedQuanta: number
  cells: number
  /** What the player path charges for the same cells, in quanta. */
  perCellQuanta: number
}

interface OpenTrip extends Omit<TripCellEnergy, 'endTick' | 'ending' | 'chargedQuanta'> {
  startEnergy: number
}

/** The fold's running state: the closed trips, the open one and the state the last batch left. */
interface TripFold {
  playerId: string
  closed: TripCellEnergy[]
  open: OpenTrip | null
  before: AuthorityState | null
}

/** A fold over a run's batches; `trips()` lists the trips so far, the open one last. */
export function createTripCellEnergyFold(playerId = 'p1') {
  const fold: TripFold = { playerId, closed: [], open: null, before: null }
  const note = (state: AuthorityState, events: readonly DomainEvent[]) => {
    openTripIfNone(fold, fold.before ?? state)
    priceBatch(fold, fold.before ?? state, events)
    closeTripOnDock(fold, state, events)
    openTripOnUndock(fold, state, events)
    fold.before = state
  }
  return { note, trips: () => tripsOf(fold) }
}

function openTripIfNone(fold: TripFold, state: AuthorityState): void {
  fold.open ??= tripOpenedAt(state, fold.playerId)
}

function priceBatch(fold: TripFold, before: AuthorityState, events: readonly DomainEvent[]) {
  if (fold.open === null) return
  const broken = brokenCellsOf(events, fold.playerId)
  fold.open.cells += broken.length
  fold.open.perCellQuanta += cellsEnergyOf(before, broken, fold.playerId)
}

function closeTripOnDock(fold: TripFold, state: AuthorityState, events: readonly DomainEvent[]) {
  const ending = endingOf(events, fold.playerId)
  if (ending === null || fold.open === null) return
  fold.closed.push(closedTrip(fold.open, state, fold.playerId, ending))
  fold.open = null
}

function openTripOnUndock(fold: TripFold, state: AuthorityState, events: readonly DomainEvent[]) {
  if (isUndocked(events, fold.playerId)) fold.open = tripOpenedAt(state, fold.playerId)
}

/** The closed trips, and the open one as far as the last batch. */
function tripsOf({ closed, open, before, playerId }: TripFold): TripCellEnergy[] {
  if (open === null || before === null) return [...closed]
  return [...closed, closedTrip(open, before, playerId, 'open')]
}

/** The tank over the trip's per-cell energy; no cut, no bound. */
export function tripTankMarginOf(trip: TripCellEnergy): number {
  return trip.perCellQuanta === 0 ? Infinity : trip.tankQuanta / trip.perCellQuanta
}

function tripOpenedAt(state: AuthorityState, playerId: string): OpenTrip | null {
  const vehicle = vehicleOf(state, playerId)
  if (vehicle.mode !== 'active') return null
  return {
    planet: state.planet.index,
    startTick: state.tick,
    tankQuanta: energyMaxQuantaOf(vehicle),
    startEnergy: vehicle.energy,
    cells: 0,
    perCellQuanta: 0,
  }
}

function brokenCellsOf(events: readonly DomainEvent[], playerId: string): TilePoint[] {
  return events.flatMap((event) =>
    event.type === 'TileDestroyed' && event.playerId === playerId
      ? [{ tx: event.tx, ty: event.ty }]
      : [],
  )
}

/** Each cell's own dig energy at the drill `before` had, as `cellDigEnergy.ts` prices it. */
function cellsEnergyOf(
  before: AuthorityState,
  broken: readonly TilePoint[],
  playerId: string,
): number {
  const params = planetParamsOf(before.planet)
  if (params === null || broken.length === 0) return 0
  const drill = heatThrottledDrill(params.planetIndex, vehicleOf(before, playerId))
  const quantum = drillQuantumAt(before, playerId)
  const subStepsOf = drillSubStepsOfCells(params, drill, shockTicksFor(before, playerId), quantum)
  return broken.reduce((sum, tile) => {
    const subSteps = subStepsOf(tile, materialCellAt(before.world, params, tile), 0) ?? 0
    return sum + cellDigEnergyOf(subSteps, BASIS_POINTS, quantum)
  }, 0)
}

/** `dock` or `rescue` when the batch docked the vehicle, else null. */
function endingOf(events: readonly DomainEvent[], playerId: string): string | null {
  const docked = events.find(
    (event) =>
      event.type === 'VehicleModeChanged' && event.playerId === playerId && event.to === 'docked',
  )
  if (docked === undefined || docked.type !== 'VehicleModeChanged') return null
  return docked.reason === 'rescue' ? 'rescue' : 'dock'
}

function isUndocked(events: readonly DomainEvent[], playerId: string): boolean {
  return events.some(
    (event) =>
      event.type === 'VehicleModeChanged' &&
      event.playerId === playerId &&
      event.from === 'docked' &&
      event.to === 'active',
  )
}

function closedTrip(
  { startEnergy, ...trip }: OpenTrip,
  state: AuthorityState,
  playerId: string,
  ending: string,
): TripCellEnergy {
  const chargedQuanta = Math.max(0, startEnergy - vehicleOf(state, playerId).energy)
  return { ...trip, endTick: state.tick, ending, chargedQuanta }
}
