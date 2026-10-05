/**
 * The collider halo (decision #36 Collision): physics only ever sees the ground near the vehicle,
 * as 4 x 4 m collision blocks, each one set of walls along the marching-squares contour of its
 * 16 x 16 sample squares. With the speed under 0.3 m per tick (#7) and the halo moved whenever the
 * vehicle enters another block, one ring of blocks round it covers every wall it can reach next,
 * so no continuous collision detection is needed. A block is rebuilt only when a chunk under it
 * changed.
 */
import { COLLISION_BLOCK_METRES } from '../../constants/physics'
import { contourSegmentsOf, type DensityAt } from '../world/groundContour'
import { SAMPLES_PER_TILE, chunkOfSample } from '../world/sampleGrid'
import type { Vector2 } from './localFrame'

export interface BlockPoint {
  bx: number
  by: number
}

const BLOCK_SAMPLES = COLLISION_BLOCK_METRES * SAMPLES_PER_TILE

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

/** Wall segments `[ax, ay, bx, by, ...]` in metres along the block's contour. */
export function wallSegmentsOf(block: BlockPoint, densityAt: DensityAt): number[] {
  const box = {
    sx0: block.bx * BLOCK_SAMPLES,
    sy0: block.by * BLOCK_SAMPLES,
    width: BLOCK_SAMPLES,
    height: BLOCK_SAMPLES,
  }
  return contourSegmentsOf(box, densityAt)
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
