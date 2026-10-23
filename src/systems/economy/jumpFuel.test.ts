import { describe, expect, it } from 'vitest'
import { add, fromCanonical, toCanonical, type Money } from '../money'
import { fuelPriceOf, fuelUnitPriceOf, jumpFuelUnitsOf } from './jumpFuel'
import { travelFee } from './planetCharges'

function canonicalOf(text: string): string {
  return toCanonical(fromCanonical(text))
}

function expectAmount(amount: Money, text: string): void {
  expect(toCanonical(amount)).toBe(canonicalOf(text))
}

describe('jump fuel (ticket 755, provisional until ticket 756)', () => {
  it('burns one unit per planet a jump crosses, either way', () => {
    expectAmount(jumpFuelUnitsOf(1, 2), '1')
    expectAmount(jumpFuelUnitsOf(1, 5), '4')
    expectAmount(jumpFuelUnitsOf(5, 1), '4')
  })

  it("prices one unit at the planet's travel fee, so the next hop costs today's fee", () => {
    expect(toCanonical(fuelUnitPriceOf(4))).toBe(toCanonical(travelFee(4)))
    expectAmount(fuelUnitPriceOf(1), '60.75')
  })

  it('prices whole units as the unit price times the count', () => {
    expectAmount(fuelPriceOf(1, 3), '182.25')
    expect(toCanonical(fuelPriceOf(4, 2))).toBe(toCanonical(add(travelFee(4), travelFee(4))))
  })
})
