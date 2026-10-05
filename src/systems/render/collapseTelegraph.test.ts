import { describe, expect, it } from 'vitest'
import { CRACKS_PER_BLOCK } from '../../constants/scene'
import type { CollapseState } from '../authority/collapse/collapseState'
import {
  BLOCK_SIZE_M,
  crackSegmentsAt,
  createTelegraphSlots,
  telegraphProgress,
  writeCrackSegment,
  writeTelegraphBlocks,
} from './collapseTelegraph'

const collapse: CollapseState = {
  blocks: [
    { block: '0,8#17', startTick: 100, isForced: false },
    { block: '-1,7#63', startTick: 140, isForced: true },
  ],
}

describe('collapse telegraph', () => {
  it('runs from nothing at the warning to full when the refill starts, and stays full', () => {
    expect(telegraphProgress(0)).toBe(0)
    expect(telegraphProgress(30)).toBe(0.5)
    expect(telegraphProgress(60)).toBe(1)
    expect(telegraphProgress(75)).toBe(1)
  })

  it('places each collapsing block in metres with its own progress', () => {
    const slots = createTelegraphSlots(4)
    expect(writeTelegraphBlocks(slots, collapse, 130)).toBe(2)
    expect(slots[0]).toMatchObject({ x0: 4, y0: 264, size: BLOCK_SIZE_M, progress: 0.5 })
    expect(slots[1]).toMatchObject({ x0: -4, y0: 252, progress: 0 })
  })

  it('draws no more blocks than it has slots', () => {
    expect(writeTelegraphBlocks(createTelegraphSlots(1), collapse, 130)).toBe(1)
  })

  it('grows the crack one segment at a time until the refill', () => {
    expect(crackSegmentsAt(0)).toBe(1)
    expect(crackSegmentsAt(0.5)).toBeLessThan(CRACKS_PER_BLOCK)
    expect(crackSegmentsAt(1)).toBe(CRACKS_PER_BLOCK)
  })

  it('cracks the same block the same way every frame, inside its bounds', () => {
    const [slot] = createTelegraphSlots(1)
    writeTelegraphBlocks([slot], collapse, 160)
    const first = new Float32Array(4)
    const again = new Float32Array(4)
    for (let index = 0; index < CRACKS_PER_BLOCK; index++) {
      writeCrackSegment(slot, index, first)
      writeCrackSegment(slot, index, again)
      expect(again).toEqual(first)
      for (const [at, from] of [
        [0, slot.x0],
        [1, slot.y0],
        [2, slot.x0],
        [3, slot.y0],
      ]) {
        expect(first[at]).toBeGreaterThanOrEqual(from)
        expect(first[at]).toBeLessThanOrEqual(from + slot.size)
      }
    }
  })
})
