import { describe, expect, it } from 'vitest'
import { campaignIndex, planetIndexOfCampaign } from '../starMap/campaignIndex'
import { cmp, div, fromCanonical, toCanonical, toFixedText, type Money } from '../money'
import {
  destinationUnitPriceOf,
  fuelPriceOf,
  fuelUnitPriceOf,
  jumpFeeOf,
  jumpFuelUnitsOf,
} from './jumpFuel'

function expectAmount(amount: Money, text: string): void {
  expect(toCanonical(amount)).toBe(toCanonical(fromCanonical(text)))
}

/** The VS law's ratio from one planet's top band to the next: 1.5^3. */
const PLANET_RATIO = '3.375'

/** The VS bars' address grid (#650): s = 1, 2, 10, 1e6 and p = 1, 2, 5, 10, 40, 1000. */
const SYSTEMS = [1n, 2n, 10n, 1000000n]
const PLACES = [1n, 2n, 5n, 10n, 40n, 1000n]

describe('star map fuel curve (ticket 756)', () => {
  it('burns U0 * (1 + 0.25 * distance) whole units, the same either way', () => {
    expectAmount(jumpFuelUnitsOf(1, 2), '5')
    expectAmount(jumpFuelUnitsOf(2, 1), '5')
    expectAmount(jumpFuelUnitsOf(1, 3), '6')
    expectAmount(jumpFuelUnitsOf(5, 1), '8')
    expectAmount(jumpFuelUnitsOf(40, 1000), '964')
  })

  it('charges the hop to the next planet half a run of the planet it leaves', () => {
    expectAmount(jumpFeeOf(1, 2), '253.125')
    expectAmount(jumpFeeOf(2, 3), '854.297')
  })

  it('grows the unit price, and with it the hop to the next planet, by 3.375 a planet', () => {
    for (const planet of [1, 2, 5, 39, 999]) {
      const ratio = div(destinationUnitPriceOf(planet + 1), destinationUnitPriceOf(planet))
      expectAmount(ratio, PLANET_RATIO)
    }
  })

  it('keeps the 3.375 ratio to 30 places at campaign index 9,999,991 (s = 1e6, p = 1 today)', () => {
    const ratio = div(destinationUnitPriceOf(9999992), destinationUnitPriceOf(9999991))
    expect(toFixedText(ratio, 30)).toBe(`${PLANET_RATIO}${'0'.repeat(27)}`)
  })

  it('prices a jump at its destination, so the trip home is cheap but never free', () => {
    expectAmount(jumpFeeOf(2, 1), '75')
    expect(cmp(jumpFeeOf(2, 1), jumpFeeOf(1, 2))).toBe(-1)
    expect(cmp(jumpFeeOf(5, 1), jumpFeeOf(1, 2))).toBe(-1)
  })

  it('never charges a jump less than one unit at the destination price', () => {
    for (const [from, to] of [
      [2, 1],
      [1, 2],
      [7, 3],
      [3, 7],
    ]) {
      expect(cmp(jumpFeeOf(from, to), destinationUnitPriceOf(to))).toBeGreaterThan(0)
    }
  })

  it("sells fuel at the next planet's unit price, so fuel for the hop on pays its fee", () => {
    expectAmount(fuelUnitPriceOf(1), '50.625')
    for (const planet of [1, 3, 12]) {
      const units = jumpFuelUnitsOf(planet, planet + 1)
      const price = fuelPriceOf(planet, Number(toCanonical(units)))
      expect(toCanonical(price)).toBe(toCanonical(jumpFeeOf(planet, planet + 1)))
    }
  })

  it('prices the next hop finitely and the same twice at every address of the VS grid', () => {
    for (const system of SYSTEMS) {
      for (const place of PLACES) {
        const planet = planetIndexOfCampaign(campaignIndex(system, place))
        const fee = toCanonical(jumpFeeOf(planet, planet + 1))
        expect(fee).toMatch(/^[1-9](\.\d+)?e\+\d+$/)
        expect(toCanonical(jumpFeeOf(planet, planet + 1))).toBe(fee)
      }
    }
  })
})
