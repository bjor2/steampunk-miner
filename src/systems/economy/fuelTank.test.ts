import { describe, expect, it } from 'vitest'
import { add, cmp, fromCanonical, toCanonical, type Money } from '../money'
import { FIRST_FUEL_TANK_LEVEL, fuelTankCapacityOf, fuelTankPriceOf } from './fuelTank'
import { jumpFuelUnitsOf } from './jumpFuel'

function expectAmount(amount: Money, text: string): void {
  expect(toCanonical(amount)).toBe(toCanonical(fromCanonical(text)))
}

describe('fuel tank track (ticket 756)', () => {
  it('starts with a tank that holds the next hop and the trip back on every planet', () => {
    for (const planet of [1, 2, 5, 40, 1000]) {
      const hopAndBack = add(
        jumpFuelUnitsOf(planet, planet + 1),
        jumpFuelUnitsOf(planet + 1, planet),
      )
      expect(cmp(fuelTankCapacityOf(FIRST_FUEL_TANK_LEVEL), hopAndBack)).toBeGreaterThanOrEqual(0)
    }
  })

  it('grows the capacity by 1.3 a level in whole units', () => {
    expectAmount(fuelTankCapacityOf(1), '10')
    expectAmount(fuelTankCapacityOf(2), '13')
    expectAmount(fuelTankCapacityOf(3), '16')
    expectAmount(fuelTankCapacityOf(11), '137')
  })

  it('prices each next level at 1.3 times the one before', () => {
    expectAmount(fuelTankPriceOf(1), '250')
    expectAmount(fuelTankPriceOf(2), '325')
    expectAmount(fuelTankPriceOf(3), '422.5')
  })

  it('has no top level: level 10,000 still has a finite capacity and price', () => {
    expect(toCanonical(fuelTankCapacityOf(10000))).toMatch(/^[1-9](\.\d+)?e\+\d+$/)
    expect(toCanonical(fuelTankPriceOf(10000))).toMatch(/^[1-9](\.\d+)?e\+\d+$/)
  })
})
