import { describe, expect, it } from 'vitest'
import { createAuthorityState } from '../../systems/authority/authorityState'
import { createBotSession } from '../../systems/bot/botSession'
import { cmp } from '../../systems/money'
import { statsOfVehicle } from '../../systems/vehicle/vehicleState'
import { arrivalOn, MAGNETIC_PLANETS, MAGNETIC_SEEDS } from './magneticPlanetRuns'

// The arrival behind `balance:magnetic-planet` (ticket 354): `debug.setUpgrade` raises the hull
// level but keeps the planet-1 hull, which the first shock (2% of the on-curve hull) wrecked on P28,
// so the bare run lost its cargo and played a different planet from the class-off run.

const SEED = MAGNETIC_SEEDS[0]

function vehicleArrivedOn(planet: number) {
  const start = createAuthorityState({ planetIndex: 1, planetSeed: SEED, playerIds: ['p1'] })
  const session = createBotSession(start, 'p1')
  for (const intent of arrivalOn(planet, SEED)) session.submit(intent)
  return session.vehicle()
}

describe('magnetic planet runs', () => {
  it.each(MAGNETIC_PLANETS)('arrives on planet %i with the on-curve hull whole', (planet) => {
    const vehicle = vehicleArrivedOn(planet)
    expect(cmp(vehicle.hull, statsOfVehicle(vehicle).hullMax)).toBe(0)
  })
})
