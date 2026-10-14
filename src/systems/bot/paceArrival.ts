/**
 * The arrival every pace harness shares (tickets 354 and 356): the pacing bot set down on a planet
 * with the on-curve levels, a little money and the hull whole, as a bot that played its way there
 * would arrive. `debug.setUpgrade` raises the hull level but keeps the planet-1 hull, so a harness
 * that set only the levels arrived with 100 HP: the first electrified shock on P28 wrecked the bare
 * magnetic run, and it played a different planet from its baseline (ticket 354).
 *
 * A pace run starts through `arrivedPaceSessionOn`, which refuses an arrival whose hull is neither
 * whole nor the hull state the spec names. The tank stays as the levels leave it: a full tank sent
 * the first trip into a collapse on P28 (ticket 354). Only specs use it.
 */
import type { CommandIntent } from '../authority/authorityCommand'
import { createAuthorityState, type AuthorityState } from '../authority/authorityState'
import { UPGRADE_IDS } from '../economy/economyDefinition'
import { stepOfMajor } from '../economy/upgradeSteps'
import { onCurveLevel, onCurveSteps, vehicleStatsAt } from '../economy/vehicleStats'
import { cmp, toCanonical, type Money } from '../money'
import { setPlanetCommand, setPlanetSeedCommand } from '../startScenarioCommands'
import { setHullCommand, setUpgradeCommand } from '../vehicle/vehicleCommands'
import { statsOfVehicle, type VehicleState } from '../vehicle/vehicleState'
import { createBotSession, type BotSession } from './botSession'
import { botPlanetOf } from './botTravel'
import { playSliceFrom, type SliceRun } from './playSlice'

/** What a pace run arrives with: a little money (ticket 356). */
export const ARRIVAL_MONEY = '20000'

/** A hull a spec arrives with on purpose, named so the run says why it is not whole. */
export interface NamedHull {
  name: string
  hull: Money
}

/** The hull a pace run arrives with: the on-curve hull whole, or a named state. */
export type ArrivalHull = 'whole' | NamedHull

/** On `planet` with the on-curve levels, a little money and `hull`, as a bot arriving there. */
export function paceArrivalOn(
  planet: number,
  worldSeed: number,
  hull: ArrivalHull = 'whole',
): CommandIntent[] {
  return [
    setPlanetCommand(planet),
    setPlanetSeedCommand(worldSeed),
    { type: 'debug.setMoney', payload: { amount: ARRIVAL_MONEY } },
    ...onCurveLevelCommandsOn(planet),
    setHullCommand(toCanonical(arrivalHullOn(planet, hull))),
  ]
}

/**
 * A fresh session arrived on `planet` with its hull checked, then `setup` sent before the first
 * trip. Throws when the arrival left the hull anything but `hull`.
 */
export function arrivedPaceSessionOn(
  planet: number,
  worldSeed: number,
  setup: readonly CommandIntent[],
  hull: ArrivalHull = 'whole',
): BotSession {
  const session = createBotSession(freshStateOn(worldSeed), 'p1')
  submitAll(session, paceArrivalOn(planet, worldSeed, hull))
  refuseOffHullArrival(session.vehicle(), hull)
  submitAll(session, setup)
  return session
}

/** The bot plays on from `session` until `planet`'s core is done or `maxTicks` run out. */
export function playToCoreFrom(session: BotSession, planet: number, maxTicks: number): SliceRun {
  return playSliceFrom(session, botPlanetOf(session, 'blast'), { maxTicks, lastPlanet: planet })
}

/** The harness assert (ticket 356): a pace run starts at full hull or at the hull state it names. */
export function refuseOffHullArrival(vehicle: VehicleState, hull: ArrivalHull): void {
  const expected = expectedHullOf(vehicle, hull)
  if (cmp(vehicle.hull, expected) === 0) return
  throw new RangeError(
    `a pace run arrived with hull ${toCanonical(vehicle.hull)}, not ${hullNameOf(hull)} ` +
      `(${toCanonical(expected)}): arrive whole or name the hull state`,
  )
}

function onCurveLevelCommandsOn(planet: number): CommandIntent[] {
  return UPGRADE_IDS.map((id) => setUpgradeCommand(id, stepOfMajor(onCurveLevel(id, planet))))
}

function arrivalHullOn(planet: number, hull: ArrivalHull): Money {
  return hull === 'whole' ? vehicleStatsAt(onCurveSteps(planet)).hullMax : hull.hull
}

function expectedHullOf(vehicle: VehicleState, hull: ArrivalHull): Money {
  return hull === 'whole' ? statsOfVehicle(vehicle).hullMax : hull.hull
}

function hullNameOf(hull: ArrivalHull): string {
  return hull === 'whole' ? 'the whole hull' : `the named hull "${hull.name}"`
}

function freshStateOn(worldSeed: number): AuthorityState {
  return createAuthorityState({ planetIndex: 1, planetSeed: worldSeed, playerIds: ['p1'] })
}

function submitAll(session: BotSession, intents: readonly CommandIntent[]): void {
  for (const intent of intents) session.submit(intent)
}
