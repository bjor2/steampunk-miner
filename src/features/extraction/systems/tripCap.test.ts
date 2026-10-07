import { describe, expect, it } from 'vitest'
import { oreTier, oreValue } from '../../../systems/economy/oreEconomy'
import {
  cmp,
  floor,
  floorMilli,
  fromCanonical,
  fromSafeInteger,
  mul,
  toCanonical,
  toSafeInteger,
} from '../../../systems/money'
import { FRESH_TRIP, type IncomeTrip } from './incomeTrip'
import { roomUnderCapOf, tripCapAt, tripCapFractionOf, tripCapUsedPercentOf } from './tripCap'

// The hard 15% clamp of #162 4.5: tripCap = floorMilli(0.15 × cargoCapacity × V(t(p, b))), the
// room it leaves, and the share of it the #164 card prints as a whole percent.

const PLANETS = Array.from({ length: 40 }, (_, index) => index + 1)
const BANDS = [1, 2, 3, 4, 5]

const money = (text: string) => fromCanonical(text)

function tripOf(incomeItemValue: string, tripCap: string): IncomeTrip {
  return {
    ...FRESH_TRIP,
    incomeItemValue: toCanonical(money(incomeItemValue)),
    tripCap: toCanonical(money(tripCap)),
  }
}

describe('income trip cap', () => {
  it('is 15% of a full hold of the band ore on every planet from 1 to 40 and every band', () => {
    const misses = PLANETS.flatMap((planet) =>
      BANDS.filter((band) => {
        const fullHold = mul(fromSafeInteger(24), oreValue(oreTier(planet, band)))
        const expected = floorMilli(mul(money('0.15'), fullHold))
        return toCanonical(tripCapAt(planet, band, 24)) !== toCanonical(expected)
      }).map((band) => `P${planet} band ${band}`),
    )
    expect(misses).toEqual([])
  })

  it('grows with the hold and with the band', () => {
    // V(1) is 10: a hold of 20 band-1 units is worth 200, its 15% is 30.
    expect(toCanonical(tripCapAt(1, 1, 20))).toBe(toCanonical(money('30')))
    expect(toCanonical(tripCapAt(1, 1, 40))).toBe(toCanonical(money('60')))
    expect(cmp(tripCapAt(9, 5, 20), tripCapAt(9, 4, 20))).toBe(1)
  })

  it('leaves the room under the cap, and none at or past it', () => {
    expect(toCanonical(roomUnderCapOf(money('4'), money('15')))).toBe(toCanonical(money('11')))
    expect(toCanonical(roomUnderCapOf(money('15'), money('15')))).toBe('0e+0')
    expect(toCanonical(roomUnderCapOf(money('16'), money('15')))).toBe('0e+0')
  })

  it('logs the used share cut to the money quantum, and 0 before any cap', () => {
    expect(toCanonical(tripCapFractionOf(money('2'), money('3')))).toBe(toCanonical(money('0.666')))
    expect(toCanonical(tripCapFractionOf(money('2'), money('0')))).toBe('0e+0')
  })

  it('prints a whole percent that reads 100 only at the cap', () => {
    expect(tripCapUsedPercentOf(FRESH_TRIP)).toBe(0)
    expect(tripCapUsedPercentOf(tripOf('2', '3'))).toBe(66)
    expect(tripCapUsedPercentOf(tripOf('14.999', '15'))).toBe(99)
    expect(tripCapUsedPercentOf(tripOf('15', '15'))).toBe(100)
  })

  it('prints the floored percent of the logged fraction, as the card and the log must agree', () => {
    const pairs = [
      ['1', '7'],
      ['5', '9'],
      ['11.25', '15'],
    ] as const
    const disagreements = pairs.filter(([value, cap]) => {
      const logged = tripCapFractionOf(money(value), money(cap))
      const loggedPercent = toSafeInteger(floor(mul(fromSafeInteger(100), logged)))
      return loggedPercent !== tripCapUsedPercentOf(tripOf(value, cap))
    })
    expect(disagreements).toEqual([])
  })
})
