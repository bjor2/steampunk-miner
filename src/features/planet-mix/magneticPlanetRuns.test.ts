import { describe, expect, it } from 'vitest'
import { arrivedPaceSessionOn } from '../../systems/bot/paceArrival'
import { cmp } from '../../systems/money'
import { statsOfVehicle } from '../../systems/vehicle/vehicleState'
import { MAGNETIC_PLANETS, MAGNETIC_SEEDS } from './magneticPlanetRuns'

// The arrival behind `balance:magnetic-planet` (ticket 354, shared since ticket 356):
// `debug.setUpgrade` raises the hull level but keeps the planet-1 hull, which the first shock (2% of
// the on-curve hull) wrecked on P28, so the bare run lost its cargo and played a different planet
// from the class-off run.

const SEED = MAGNETIC_SEEDS[0]

describe('magnetic planet runs', () => {
  it.each(MAGNETIC_PLANETS)('arrives on planet %i with the on-curve hull whole', (planet) => {
    const vehicle = arrivedPaceSessionOn(planet, SEED, []).vehicle()
    expect(cmp(vehicle.hull, statsOfVehicle(vehicle).hullMax)).toBe(0)
  })
})
