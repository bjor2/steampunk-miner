import { describe, expect, it } from 'vitest'
import { UP_VECTOR_SCALE } from '../../constants/physics'
import type { TilePoint } from '../world/tileGrid'
import { cutStepMmOf } from './cutSpeed'
import { isWithinOneCell, stepPaidAlongMm, type FrontLine } from './lineCellStep'

/** Down a column from the top edge of row 240: row 239 is the first cell it crosses. */
const LINE: FrontLine = {
  from: { xMm: 30_500, yMm: 240_000 },
  aim: { x: 0, y: -UP_VECTOR_SCALE },
  limitMm: 63_200,
}
/** The 3600 m/s rig's lifted quantum on planet 1 (ticket 558). */
const QUANTUM = 7_680

/** The drill times of the cells the line crosses, in order, and open ground past them. */
function cellsCrossed(times: readonly number[]): (tile: TilePoint) => number {
  return ({ ty }) => times[239 - ty] ?? 0
}

describe('front step along its line past a cell a tick (ticket 733)', () => {
  it('keeps the slab lead step while a tick crosses at most a cell', () => {
    expect(isWithinOneCell(1_000)).toBe(true)
    expect(isWithinOneCell(1_001)).toBe(false)
  })

  it('steps the law step through cells alike', () => {
    for (const time of [128, 152, 191]) {
      const cells = cellsCrossed(Array.from({ length: 64 }, () => time))
      expect(stepPaidAlongMm(LINE, cells, QUANTUM)).toBe(cutStepMmOf(time, QUANTUM))
    }
  })

  it('pays each cell its own time, so one hard cell ahead slows only its own metre', () => {
    const cells = cellsCrossed(Array.from({ length: 64 }, (_, index) => (index === 40 ? 191 : 140)))
    // 40 cells of 140 cost 5600 and the hard one 191: the 1889 left pays 13 more cells and 492 mm.
    expect(stepPaidAlongMm(LINE, cells, QUANTUM)).toBe(54_492)
    expect(cutStepMmOf(191, QUANTUM)).toBe(40_209)
  })

  it('runs through open ground to the cutting bound', () => {
    expect(stepPaidAlongMm(LINE, cellsCrossed([]), QUANTUM)).toBe(LINE.limitMm)
  })

  it('stops part way into the first cell it cannot pay in full, as far as the rest pays', () => {
    expect(stepPaidAlongMm(LINE, cellsCrossed([0, 0, 20_000]), QUANTUM)).toBe(2_000 + 384)
  })

  it('reads no cell past the one its work runs out in', () => {
    const read = new Set<number>()
    const cells = cellsCrossed(Array.from({ length: 64 }, () => 191))
    stepPaidAlongMm(LINE, (tile) => (read.add(tile.ty), cells(tile)), QUANTUM)
    expect(Math.min(...read)).toBe(239 - 40)
  })
})
