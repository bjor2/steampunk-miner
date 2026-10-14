import { describe, expect, it } from 'vitest'
import type { DensityAt } from '../world/groundContour'
import { AIR_DENSITY, SAMPLES_PER_TILE, SOLID_DENSITY } from '../world/sampleGrid'
import type { TilePoint } from '../world/tileGrid'
import { passThroughInBlock, wallSegmentsOf } from './colliderHalo'

// The collider halo's walls with a glide's pass-through cell (ticket 390): the body crosses the
// one cell's ground as if it were open, and every other wall stands.

/** A solid cell between two open ones in a column of solid ground, all in block (1, 1). */
const PHASED: TilePoint = { tx: 5, ty: 6 }
const OPEN = new Set(['5,7', '5,5'])
const BLOCK = { bx: 1, by: 1 }

const densityAt: DensityAt = (sx, sy) => {
  const key = `${Math.floor(sx / SAMPLES_PER_TILE)},${Math.floor(sy / SAMPLES_PER_TILE)}`
  return OPEN.has(key) ? AIR_DENSITY : SOLID_DENSITY
}

/** Each segment as `[ax, ay, bx, by]`. */
function segmentsOf(flat: readonly number[]): number[][] {
  const segments: number[][] = []
  for (let at = 0; at < flat.length; at += 4) segments.push(flat.slice(at, at + 4))
  return segments
}

/** Contour crossings land within a hair of the eighth between two samples. */
const toEighth = (metres: number) => Math.round(metres * 8) / 8

/** The heights of the level walls across the column: a floor or a ceiling of an open cell. */
function levelWallHeightsOf(flat: readonly number[]): number[] {
  const heights = segmentsOf(flat)
    .filter(([, ay, , by]) => ay === by)
    .map(([, ay]) => toEighth(ay))
  return [...new Set(heights)].sort((a, b) => a - b)
}

/** Within the cell's square or the one-sample strip below and left of it. */
function isInCellReach([ax, ay, bx, by]: number[], cell: TilePoint): boolean {
  const [midX, midY] = [(ax + bx) / 2, (ay + by) / 2]
  const reach = 1 / SAMPLES_PER_TILE
  return (
    midX >= cell.tx - reach && midX < cell.tx + 1 && midY >= cell.ty - reach && midY < cell.ty + 1
  )
}

describe('collider halo pass-through', () => {
  it('drops the walls the passed-through cell makes, above and below, and keeps every other', () => {
    const whole = wallSegmentsOf(BLOCK, densityAt)
    const passed = wallSegmentsOf(BLOCK, densityAt, PHASED)
    expect(levelWallHeightsOf(whole)).toEqual([4.875, 5.875, 6.875, 7.875])
    expect(levelWallHeightsOf(passed)).toEqual([4.875, 7.875])
    const kept = new Set(segmentsOf(passed).map((segment) => segment.join(',')))
    const dropped = segmentsOf(whole).filter((segment) => !kept.has(segment.join(',')))
    expect(dropped.length).toBeGreaterThan(0)
    expect(dropped.every((segment) => isInCellReach(segment, PHASED))).toBe(true)
    expect(segmentsOf(passed).some((segment) => isInCellReach(segment, PHASED))).toBe(false)
  })

  it('builds the same walls with no pass-through as before', () => {
    expect(wallSegmentsOf(BLOCK, densityAt, null)).toEqual(wallSegmentsOf(BLOCK, densityAt))
  })

  it('names the pass-through cell to the blocks holding its walls, and only to them', () => {
    const onEdge: TilePoint = { tx: 4, ty: 6 }
    expect(passThroughInBlock({ bx: 1, by: 1 }, onEdge)).toBe(onEdge)
    expect(passThroughInBlock({ bx: 0, by: 1 }, onEdge)).toBe(onEdge)
    expect(passThroughInBlock({ bx: 2, by: 1 }, onEdge)).toBeNull()
    expect(passThroughInBlock({ bx: 1, by: 0 }, onEdge)).toBeNull()
    expect(passThroughInBlock({ bx: 0, by: 1 }, PHASED)).toBeNull()
    expect(passThroughInBlock(BLOCK, null)).toBeNull()
  })
})
