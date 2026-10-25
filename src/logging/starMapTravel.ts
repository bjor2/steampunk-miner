/**
 * The star-map travel rows of ticket 756 (the Systems ruling on #756 and the GD lock on #650),
 * folded from a bot run's steps beside the R3 tallies (`radiusRebaseline.ts`, which keeps each
 * hop's charge, list fee and the wallet at core harvest): per planet the sale of each run (a haul
 * docked at the Sell bay and what sold there, the measured R) and the vehicle's levels as it left; over
 * the run the money spent, and on fuel and on the tank track. Derived, never written into the log
 * (#11 section 3).
 */
import type { AuthorityState } from '../systems/authority/authorityState'
import type { DomainEvent } from '../systems/authority/domainEvent'
import type { UpgradeLevels } from '../systems/economy/vehicleStats'
import { add, cmp, fromCanonical, sub, ZERO_MONEY, type Money } from '../systems/money'

export interface StarMapSpend {
  total: Money
  fuel: Money
  tank: Money
}

export interface StarMapTravelTally {
  /** Each planet's run sales in order: a run opens when the vehicle docks after a trip. */
  runSales: Map<number, Money[]>
  /** The levels the vehicle left each planet with. */
  departureLevels: Map<number, UpgradeLevels>
  spend: StarMapSpend
}

export function emptyStarMapTravelTally(): StarMapTravelTally {
  return {
    runSales: new Map(),
    departureLevels: new Map(),
    spend: { total: ZERO_MONEY, fuel: ZERO_MONEY, tank: ZERO_MONEY },
  }
}

/** One bot step: the state after it and the events it answered, folded in place. */
export function tallyStarMapTravelStep(
  tally: StarMapTravelTally,
  state: AuthorityState,
  playerId: string,
  events: readonly DomainEvent[],
): void {
  if (events.some(isDebugCommand)) return
  events.forEach((event) => tallyEvent(tally, state, playerId, event))
}

function tallyEvent(
  tally: StarMapTravelTally,
  state: AuthorityState,
  playerId: string,
  event: DomainEvent,
): void {
  if (isHaulDocked(event)) openRun(tally, state.planet.index)
  if (event.type === 'ResourceSold') addToRun(tally, state.planet.index, event.value)
  if (event.type === 'MoneyChanged') tallySpend(tally, event.from, event.to)
  if (event.type === 'FuelBought') tally.spend.fuel = add(tally.spend.fuel, cost(event.cost))
  if (event.type === 'FuelTankBought') tally.spend.tank = add(tally.spend.tank, cost(event.cost))
  if (event.type === 'TravelStarted') keepDepartureLevels(tally, state, playerId, event.fromPlanet)
}

/** A run ends where the vehicle docks at the Sell bay with a hold to sell. */
function isHaulDocked(event: DomainEvent): boolean {
  return event.type === 'DockEntered' && event.bay === 'sell' && event.cargoUnits > 0n
}

function openRun(tally: StarMapTravelTally, planet: number): void {
  tally.runSales.set(planet, [...(tally.runSales.get(planet) ?? []), ZERO_MONEY])
}

/** A sale joins the planet's last run; one before any dock opens the first. */
function addToRun(tally: StarMapTravelTally, planet: number, value: string): void {
  const runs = tally.runSales.get(planet) ?? [ZERO_MONEY]
  const last = runs.length - 1
  tally.runSales.set(planet, [...runs.slice(0, last), add(runs[last], fromCanonical(value))])
}

function tallySpend(tally: StarMapTravelTally, from: string, to: string): void {
  const change = sub(fromCanonical(to), fromCanonical(from))
  if (cmp(change, ZERO_MONEY) >= 0) return
  tally.spend.total = sub(tally.spend.total, change)
}

/** The jump or travel step leaves the levels as they were. */
function keepDepartureLevels(
  tally: StarMapTravelTally,
  state: AuthorityState,
  playerId: string,
  planet: number,
): void {
  tally.departureLevels.set(planet, { ...state.players[playerId].vehicle.levels })
}

function cost(text: string): Money {
  return fromCanonical(text)
}

function isDebugCommand(event: DomainEvent): boolean {
  return event.type === 'DebugCommandApplied'
}
