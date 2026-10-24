import { describe, expect, it } from 'vitest'
import { CASING_GRADE_LOOKS, casingGradeLookOf, firstGradeWithFullPips } from './casingGradeLook'
import {
  CASING_LOOK_PIPS_MOST,
  CASING_TYPE_MOST,
  CASING_TYPE_UNIT,
  casingLookBitsOf,
  casingLookBitsOfLook,
  casingLookOfBits,
  isCasedBits,
  NO_CASING_LOOK,
} from './casingLookBits'

// CG2 (ticket 830): the casing look channel beside the gate slot, one float per tile.

const STANDARD = 0
const REFRACTORY = 1

describe('casing look channel (ticket 830)', () => {
  it('carries the plate, finish, drawn pips and lining type of a grade, and reads them back', () => {
    for (const grade of [1, 2, 5, 6, 15, 16, 61, 1_000_000]) {
      const look = casingGradeLookOf(grade)
      const bits = casingLookBitsOf(grade, REFRACTORY)
      expect(casingLookOfBits(bits)).toEqual({
        plateIndex: look.plateIndex,
        finishIndex: look.finishIndex,
        drawnPips: look.drawnPips,
        typeIndex: REFRACTORY,
      })
    }
  })

  it('reads 0 as a cell with no lining', () => {
    expect(casingLookOfBits(NO_CASING_LOOK)).toBeNull()
    expect(isCasedBits(NO_CASING_LOOK)).toBe(false)
    expect(isCasedBits(casingLookBitsOf(1, STANDARD))).toBe(true)
  })

  it('tells grade 1 standard lining from no lining by one, so a lined cell is never 0', () => {
    expect(casingLookBitsOf(1, STANDARD)).toBe(1)
  })

  it('keeps every value a whole number below 2^24, exact in a float attribute', () => {
    const top = casingLookBitsOf(firstGradeWithFullPips() + 7, CASING_TYPE_MOST)
    expect(top).toBeLessThan(2 ** 24)
    expect(Math.fround(top)).toBe(top)
    expect(casingLookBitsOf(1, STANDARD + 1)).toBe(CASING_TYPE_UNIT + 1)
  })

  it('holds the table pips inside the channel', () => {
    expect(CASING_GRADE_LOOKS.pips.most).toBeLessThanOrEqual(CASING_LOOK_PIPS_MOST)
  })

  it('refuses a lining type index outside the channel', () => {
    expect(() => casingLookBitsOf(1, -1)).toThrow(RangeError)
    expect(() => casingLookBitsOf(1, CASING_TYPE_MOST + 1)).toThrow(RangeError)
    expect(() => casingLookBitsOf(1, 0.5)).toThrow(RangeError)
  })

  it('refuses a look whose slots the shader has not got', () => {
    const look = { ...casingGradeLookOf(1), plateIndex: 5 }
    expect(() => casingLookBitsOfLook(look, STANDARD)).toThrow(/plate slot 5/)
  })
})
