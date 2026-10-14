import { describe, expect, it } from 'vitest'
import type { TilePoint } from '../../world/tileGrid'
import { boreCellsFrom, seamCellsFrom, type SeamGround } from './boreWalk'

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

const SEAM_ORE = 0x31000000
const OTHER_ORE = 0x32000000
const EAST = { x: 7, y: 0 }

/** Ground with ore at the listed tiles, everything inside the arc unless a spec says otherwise. */
function groundWith(
  ore: readonly [number, number, number][],
  isInArc: (tile: TilePoint) => boolean = () => true,
): SeamGround {
  return {
    oreAt: (tile) => ore.find(([tx, ty]) => tx === tile.tx && ty === tile.ty)?.[2] ?? null,
    isInArc,
  }
}

/** A seam east of START: two ore cells on the line, then it bends one row down for two more. */
const BENT_SEAM = groundWith([
  [4, -7, SEAM_ORE],
  [5, -7, SEAM_ORE],
  [5, -8, SEAM_ORE],
  [6, -8, SEAM_ORE],
])

function offsetsOf(cells: readonly TilePoint[]): [number, number][] {
  return cells.map((cell) => [cell.tx - START.tx, cell.ty - START.ty])
}

describe('bore walk: seam turns (ticket 377, the rifled bore on #310)', () => {
  it('walks the straight line with no turns, whatever the ore', () => {
    expect(seamCellsFrom(START, EAST, 5, 0, BENT_SEAM)).toEqual(boreCellsFrom(START, EAST, 5))
  })

  it('jogs onto the seam where the line would leave it, then goes on in the same direction', () => {
    expect(offsetsOf(seamCellsFrom(START, EAST, 5, 1, BENT_SEAM))).toEqual([
      [1, 0],
      [2, 0],
      [2, -1],
      [3, -1],
      [4, -1],
    ])
  })

  it('keeps the range: a jog is one of its cells, never an extra one', () => {
    expect(seamCellsFrom(START, EAST, 5, 1, BENT_SEAM)).toHaveLength(5)
  })

  it('takes no more turns than it has', () => {
    const stairs = groundWith([
      [4, -7, SEAM_ORE],
      [4, -8, SEAM_ORE],
      [4, -9, SEAM_ORE],
      [4, -10, SEAM_ORE],
    ])
    expect(offsetsOf(seamCellsFrom(START, EAST, 4, 2, stairs))).toEqual([
      [1, 0],
      [1, -1],
      [1, -2],
      [2, -2],
    ])
  })

  it('turns only after its first ore cell, and only onto that same ore', () => {
    const otherOre = groundWith([
      [4, -7, SEAM_ORE],
      [5, -7, SEAM_ORE],
      [5, -8, OTHER_ORE],
    ])
    expect(seamCellsFrom(START, EAST, 4, 1, otherOre)).toEqual(boreCellsFrom(START, EAST, 4))
    const rockFirst = groundWith([[4, -8, SEAM_ORE]])
    expect(seamCellsFrom(START, EAST, 4, 1, rockFirst)).toEqual(boreCellsFrom(START, EAST, 4))
  })

  it('never jogs onto a tile outside the arc', () => {
    const outsideArc = groundWith(
      [
        [4, -7, SEAM_ORE],
        [5, -7, SEAM_ORE],
        [5, -8, SEAM_ORE],
      ],
      (tile) => tile.ty === -7,
    )
    expect(seamCellsFrom(START, EAST, 4, 1, outsideArc)).toEqual(boreCellsFrom(START, EAST, 4))
  })

  it('never jogs back against its direction nor onto a cell it already took', () => {
    const behind = groundWith([
      [4, -7, SEAM_ORE],
      [5, -7, SEAM_ORE],
    ])
    expect(seamCellsFrom(START, EAST, 4, 4, behind)).toEqual(boreCellsFrom(START, EAST, 4))
  })

  it('tries the most forward step first, then sideways in table order', () => {
    const both = groundWith([
      [4, -7, SEAM_ORE],
      [4, -6, SEAM_ORE],
      [4, -8, SEAM_ORE],
    ])
    expect(offsetsOf(seamCellsFrom(START, EAST, 2, 1, both))).toEqual([
      [1, 0],
      [1, 1],
    ])
  })
})
