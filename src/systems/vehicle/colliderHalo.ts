/**
 * The collider halo (decision #36 Collision): physics only ever sees the ground near the vehicle,
 * as 4 x 4 m collision blocks, each one set of walls along the marching-squares contour of its
 * 16 x 16 sample squares. With the speed under 0.3 m per tick (#7) and the halo moved whenever the
 * vehicle enters another block, one ring of blocks round it covers every wall it can reach next,
 * so no continuous collision detection is needed. A block is rebuilt only when a chunk under it
 * changed, or a glide's pass-through cell (ticket 390) came or went over it.
 */
import { COLLISION_BLOCK_METRES } from '../../constants/physics'
import { contourSegmentsOf, type DensityAt } from '../world/groundContour'
import { SAMPLES_PER_TILE, chunkOfSample } from '../world/sampleGrid'
import type { TilePoint } from '../world/tileGrid'
import type { Vector2 } from './localFrame'

export interface BlockPoint {
  bx: number
  by: number
}

const BLOCK_SAMPLES = COLLISION_BLOCK_METRES * SAMPLES_PER_TILE
const SEGMENT_NUMBERS = 4
const HALF_TILE = 0.5
const METRES_PER_SAMPLE = 1 / SAMPLES_PER_TILE

export function blockOfPoint(position: Vector2): BlockPoint {
  return {
    bx: Math.floor(position.x / COLLISION_BLOCK_METRES),
    by: Math.floor(position.y / COLLISION_BLOCK_METRES),
  }
}

/** The square of blocks `radius` blocks round `centre`. */
export function blocksAround(centre: BlockPoint, radius: number): BlockPoint[] {
  const blocks: BlockPoint[] = []
  for (let by = centre.by - radius; by <= centre.by + radius; by++) {
    for (let bx = centre.bx - radius; bx <= centre.bx + radius; bx++) blocks.push({ bx, by })
  }
  return blocks
}

/**
 * Wall segments `[ax, ay, bx, by, ...]` in metres along the block's contour, less the walls of
 * the one cell a glide passes through (ticket 390): the body crosses that cell's ground as if it
 * were open, and every other wall stands.
 */
export function wallSegmentsOf(
  block: BlockPoint,
  densityAt: DensityAt,
  passThrough: TilePoint | null = null,
): number[] {
  const box = {
    sx0: block.bx * BLOCK_SAMPLES,
    sy0: block.by * BLOCK_SAMPLES,
    width: BLOCK_SAMPLES,
    height: BLOCK_SAMPLES,
  }
  const segments = contourSegmentsOf(box, densityAt)
  return passThrough === null ? segments : withoutSegmentsIn(segments, passThrough)
}

/**
 * The pass-through cell when the block holds any of its walls, else null: what the block's walls
 * depend on. The cell's own block, and the one below or left of it when the cell sits on its edge.
 */
export function passThroughInBlock(
  block: BlockPoint,
  passThrough: TilePoint | null,
): TilePoint | null {
  if (passThrough === null || !isCellNearBlock(block, passThrough)) return null
  return passThrough
}

function isCellNearBlock(block: BlockPoint, cell: TilePoint): boolean {
  const reachStart = blockOfPoint({
    x: cell.tx - METRES_PER_SAMPLE,
    y: cell.ty - METRES_PER_SAMPLE,
  })
  const home = blockOfPoint({ x: cell.tx + HALF_TILE, y: cell.ty + HALF_TILE })
  return isBetween(block.bx, reachStart.bx, home.bx) && isBetween(block.by, reachStart.by, home.by)
}

function isBetween(value: number, low: number, high: number): boolean {
  return value >= low && value <= high
}

function withoutSegmentsIn(segments: readonly number[], cell: TilePoint): number[] {
  const kept: number[] = []
  for (let at = 0; at < segments.length; at += SEGMENT_NUMBERS) {
    if (!isSegmentInCell(segments, at, cell)) kept.push(...segments.slice(at, at + SEGMENT_NUMBERS))
  }
  return kept
}

/**
 * A segment runs inside one sample square, the square its midpoint lies in. The cell's walls are
 * those in the squares with a corner on one of its samples: its own square and the strip one
 * sample wide below and left of it, where its bottom and left edges' contour runs.
 */
function isSegmentInCell(segments: readonly number[], at: number, cell: TilePoint): boolean {
  const midX = (segments[at] + segments[at + 2]) / 2
  const midY = (segments[at + 1] + segments[at + 3]) / 2
  return isWithinCellReach(midX, cell.tx) && isWithinCellReach(midY, cell.ty)
}

function isWithinCellReach(metres: number, cellStart: number): boolean {
  return metres >= cellStart - METRES_PER_SAMPLE && metres < cellStart + 1
}

/** The chunks whose samples a block reads: its own squares reach one sample past its edge. */
export function chunksUnderBlock(block: BlockPoint): { cx: number; cy: number }[] {
  const x0 = chunkOfSample(block.bx * BLOCK_SAMPLES)
  const y0 = chunkOfSample(block.by * BLOCK_SAMPLES)
  const x1 = chunkOfSample((block.bx + 1) * BLOCK_SAMPLES)
  const y1 = chunkOfSample((block.by + 1) * BLOCK_SAMPLES)
  const chunks: { cx: number; cy: number }[] = []
  for (let cy = y0; cy <= y1; cy++) {
    for (let cx = x0; cx <= x1; cx++) chunks.push({ cx, cy })
  }
  return chunks
}
