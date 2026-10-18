import { describe, expect, it } from 'vitest'
import { PACING_WORLD_SEEDS } from '../../constants/pacingSeeds'
import type { CommandIntent } from '../authority/authorityCommand'
import { createAuthorityState } from '../authority/authorityState'
import { UPGRADE_IDS } from '../economy/economyDefinition'
import { onCurveStep } from '../economy/vehicleStats'
import { cmp, fromSafeInteger, toCanonical } from '../money'
import { setPlanetCommand, setPlanetSeedCommand } from '../startScenarioCommands'
import { setUpgradeCommand } from '../vehicle/vehicleCommands'
import { statsOfVehicle } from '../vehicle/vehicleState'
import { createBotSession } from './botSession'
import { arrivedPaceSessionOn, refuseOffHullArrival } from './paceArrival'

// The pace harnesses' shared arrival (tickets 354 and 356): `debug.setUpgrade` raises the hull
// level but keeps the planet-1 hull, so an arrival that set only the levels started at 100 HP.

const SEED = PACING_WORLD_SEEDS['bot-slice'][0]
/** The drill-gear, no-free-cell and magnet planets, and the magnetic class's three. */
const PACE_PLANETS = [7, 10, 25, 28, 32]
const PLANET_ONE_HULL = fromSafeInteger(100)

/** The arrival the harnesses copied before ticket 356: the on-curve levels and nothing else. */
function levelsOnlyArrivalOn(planet: number): CommandIntent[] {
  return [
    setPlanetCommand(planet),
    setPlanetSeedCommand(SEED),
    ...UPGRADE_IDS.map((id) => setUpgradeCommand(id, onCurveStep(id, planet))),
  ]
}

function vehicleAfter(intents: readonly CommandIntent[]) {
  const start = createAuthorityState({ planetIndex: 1, planetSeed: SEED, playerIds: ['p1'] })
  const session = createBotSession(start, 'p1')
  for (const intent of intents) session.submit(intent)
  return session.vehicle()
}

describe('pace arrival', () => {
  it.each(PACE_PLANETS)('arrives on planet %i with the on-curve hull whole', (planet) => {
    const vehicle = arrivedPaceSessionOn(planet, SEED, []).vehicle()
    expect(cmp(vehicle.hull, statsOfVehicle(vehicle).hullMax)).toBe(0)
  })

  it('refuses a run that arrives with the planet-1 hull of 100 HP', () => {
    const vehicle = vehicleAfter(levelsOnlyArrivalOn(10))
    expect(toCanonical(vehicle.hull)).toBe(toCanonical(PLANET_ONE_HULL))
    expect(() => refuseOffHullArrival(vehicle, 'whole')).toThrow(/arrived with hull 1e\+2/)
  })

  it('arrives with a hull state the spec names', () => {
    const named = { name: 'planet-1 hull', hull: PLANET_ONE_HULL }
    const vehicle = arrivedPaceSessionOn(10, SEED, [], named).vehicle()
    expect(cmp(vehicle.hull, PLANET_ONE_HULL)).toBe(0)
  })

  it('refuses a named hull state the arrival could not set', () => {
    const pastMax = { name: 'past the hull', hull: fromSafeInteger(Number.MAX_SAFE_INTEGER) }
    expect(() => arrivedPaceSessionOn(7, SEED, [], pastMax)).toThrow(/named hull "past the hull"/)
  })
})
