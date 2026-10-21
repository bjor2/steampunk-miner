import { describe, expect, it } from 'vitest'
import { POP_SIZE_CAP_CELLS } from '../../constants/materialPop'
import { packedRgbOf } from '../render/kindLookTable'
import {
  easeInFlight,
  isPopGlinting,
  NO_POP_LADDER,
  popColourOf,
  popFlightSecondsOf,
  popSizeCellsOf,
  type PopLadder,
} from './popLook'

// The pop's size ladder and flight (the final B bars on #442): 0.25 × 1.25^step cells up to the
// 0.8 cap, the top step and above glinting; 0.35 to 0.5 s to the hold with ease-in.

const FIVE_STEP_LADDER: PopLadder = {
  tints: [
    [0, 1, 0],
    [0, 0, 1],
    [1, 0, 1],
    [1, 1, 0],
  ],
  topStep: 4,
}

describe('material pop look', () => {
  it('sizes a common pop at a quarter cell and each step 1.25 times the last', () => {
    expect(popSizeCellsOf(0)).toBeCloseTo(0.25, 9)
    expect(popSizeCellsOf(1)).toBeCloseTo(0.3125, 9)
    expect(popSizeCellsOf(3)).toBeCloseTo(0.25 * 1.25 ** 3, 9)
  })

  it('stops growing at the 0.8 cell cap', () => {
    expect(popSizeCellsOf(5)).toBeLessThan(POP_SIZE_CAP_CELLS)
    expect(popSizeCellsOf(6)).toBe(POP_SIZE_CAP_CELLS)
    expect(popSizeCellsOf(12)).toBe(POP_SIZE_CAP_CELLS)
  })

  it('glints from the table’s top step up, whatever the table’s length', () => {
    expect([3, 4, 5].map((step) => isPopGlinting(step, 4))).toEqual([false, true, true])
    expect([1, 2].map((step) => isPopGlinting(step, 2))).toEqual([false, true])
  })

  it('glints from the step the cap holds when the table runs longer', () => {
    expect([5, 6, 7].map((step) => isPopGlinting(step, 9))).toEqual([false, true, true])
  })

  it('never glints a common pop of a table with no steps above common', () => {
    expect(isPopGlinting(0, 0)).toBe(false)
  })

  it('flies 0.35 s for a common pop and up to 0.5 s at the cap', () => {
    expect(popFlightSecondsOf(popSizeCellsOf(0))).toBeCloseTo(0.35, 9)
    expect(popFlightSecondsOf(POP_SIZE_CAP_CELLS)).toBeCloseTo(0.5, 9)
    for (let step = 0; step < 10; step++) {
      const seconds = popFlightSecondsOf(popSizeCellsOf(step))
      expect(seconds).toBeGreaterThanOrEqual(0.35 - 1e-9)
      expect(seconds).toBeLessThanOrEqual(0.5 + 1e-9)
    }
  })

  it('eases in: the first half of the flight covers a quarter of the way', () => {
    expect(easeInFlight(0)).toBe(0)
    expect(easeInFlight(0.5)).toBeCloseTo(0.25, 9)
    expect(easeInFlight(1)).toBe(1)
  })

  it('colours a rarer find by its rarity tint and a common one by brass', () => {
    expect(popColourOf('guarded', 2, FIVE_STEP_LADDER)).toBe(packedRgbOf([0, 0, 1]))
    expect(popColourOf('guarded', 7, FIVE_STEP_LADDER)).toBe(packedRgbOf([1, 1, 0]))
    expect(popColourOf('common', 0, FIVE_STEP_LADDER)).toBe(popColourOf('common', 3, NO_POP_LADDER))
  })

  it('gives specials their own colour', () => {
    expect(popColourOf('special', 0, FIVE_STEP_LADDER)).not.toBe(
      popColourOf('common', 0, FIVE_STEP_LADDER),
    )
  })
})
