import { describe, expect, it } from 'vitest'
import { boreCellsFrom } from './boreWalk'

const START = { tx: 3, ty: -7 }

describe('bore walk: the integer DDA (ticket 313)', () => {
  it('walks a level line one tile at a time from the tile after the start', () => {
    expect(boreCellsFrom(START, { x: 5, y: 0 }, 4)).toEqual([
      { tx: 4, ty: -7 },
      { tx: 5, ty: -7 },
      { tx: 6, ty: -7 },
      { tx: 7, ty: -7 },
    ])
  })

  it('walks straight down the column', () => {
    expect(boreCellsFrom(START, { x: 0, y: -9 }, 2)).toEqual([
      { tx: 3, ty: -8 },
      { tx: 3, ty: -9 },
    ])
  })

  it('crosses a corner along x first, then y, on an exact diagonal', () => {
    expect(boreCellsFrom(START, { x: -4, y: -4 }, 4)).toEqual([
      { tx: 2, ty: -7 },
      { tx: 2, ty: -8 },
      { tx: 1, ty: -8 },
      { tx: 1, ty: -9 },
    ])
  })

  it('steps twice along the steep axis for a 2:1 slope', () => {
    expect(boreCellsFrom(START, { x: 1, y: -2 }, 4)).toEqual([
      { tx: 3, ty: -8 },
      { tx: 4, ty: -8 },
      { tx: 4, ty: -9 },
      { tx: 4, ty: -10 },
    ])
  })

  it('gives the same cells for the same start, direction and range', () => {
    const direction = { x: 512 * 1024, y: -887 * 1024 }
    expect(boreCellsFrom(START, direction, 10)).toEqual(boreCellsFrom(START, direction, 10))
  })

  it('names no cell for a zero direction', () => {
    expect(boreCellsFrom(START, { x: 0, y: 0 }, 4)).toEqual([])
  })
})
