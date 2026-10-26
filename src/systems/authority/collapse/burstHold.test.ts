import { describe, expect, it } from 'vitest'
import { COLLAPSE_WARN_TICKS } from '../../../constants/balance'
import { TICKS_PER_SECOND } from '../../../constants/physics'
import { burstHoldTicks, gradesShortOf } from './burstHold'

const SECOND = TICKS_PER_SECOND

describe('casing burst hold (ticket 829)', () => {
  it('holds 20 s one grade short and halves with every grade more', () => {
    expect([1n, 2n, 3n, 4n, 5n].map(burstHoldTicks)).toEqual([
      20 * SECOND,
      10 * SECOND,
      5 * SECOND,
      (5 * SECOND) / 2,
      (5 * SECOND) / 4,
    ])
  })

  it("never holds under #43's 1 s, however short the lining is", () => {
    expect(COLLAPSE_WARN_TICKS).toBe(SECOND)
    expect([6n, 7n, 31n, 32n, 10n ** 9n].map(burstHoldTicks)).toEqual([
      SECOND,
      SECOND,
      SECOND,
      SECOND,
      SECOND,
    ])
  })

  it('counts the grades a wall is short as the grade its cell needs less the grade it holds', () => {
    const weakness = { band: 3, weakestGrade: 7n, required: 11n, tile: { tx: 0, ty: 0 } }
    expect(gradesShortOf(weakness)).toBe(4n)
  })
})
