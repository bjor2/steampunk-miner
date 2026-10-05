/**
 * The ground's surface (decision #36 Collision and rendering): the marching-squares contour of the
 * density field at 128, one segment list per block of samples, for the collider halo and the
 * renderer. Derived from the integer field and never saved or hashed, so it may use floats; it
 * uses only + - * / and comparisons, so it is the same everywhere anyway.
 *
 * A square between four neighbouring samples is solid at a corner when the corner is at or above
 * 128. Where an edge's two corners disagree, the contour crosses it at the linear interpolation
 * of 128. A saddle (diagonal corners agree, neighbours disagree) is split by the square's mean,
 * so a narrow solid bridge stays joined when its middle holds.
 */
import { ISO_DENSITY, SAMPLES_PER_TILE } from './sampleGrid'

/** The density at any world sample, across chunk borders. */
export type DensityAt = (sx: number, sy: number) => number

/** A block of squares: square `(sx, sy)` has its lower-left corner at sample `(sx, sy)`. */
export interface SampleBlock {
  sx0: number
  sy0: number
  /** Squares per side. */
  width: number
  height: number
}

const METRES_PER_SAMPLE = 1 / SAMPLES_PER_TILE

/** Segments as `[ax, ay, bx, by, ...]` in world metres. */
export function contourSegmentsOf(block: SampleBlock, densityAt: DensityAt): number[] {
  const segments: number[] = []
  for (let sy = block.sy0; sy < block.sy0 + block.height; sy++) {
    for (let sx = block.sx0; sx < block.sx0 + block.width; sx++) {
      writeSquareSegments(segments, densityAt, sx, sy)
    }
  }
  return segments
}

interface Square {
  sx: number
  sy: number
  /** Corners counter-clockwise from the lower left. */
  a: number
  b: number
  c: number
  d: number
}

/** Edges counter-clockwise: bottom (a-b), right (b-c), top (c-d), left (d-a). */
type Edge = 0 | 1 | 2 | 3

/**
 * The edge pairs each case joins, by corners solid (a 1, b 2, c 4, d 8). The saddles 5 and 10
 * listed here assume a solid middle (they cut off the two air corners); `edgePairsOf` swaps them.
 */
const EDGE_PAIRS: readonly (readonly Edge[])[] = [
  [],
  [3, 0],
  [0, 1],
  [3, 1],
  [1, 2],
  [0, 1, 2, 3],
  [0, 2],
  [3, 2],
  [2, 3],
  [0, 2],
  [3, 0, 1, 2],
  [1, 2],
  [1, 3],
  [0, 1],
  [3, 0],
  [],
]

function writeSquareSegments(segments: number[], densityAt: DensityAt, sx: number, sy: number) {
  const square = {
    sx,
    sy,
    a: densityAt(sx, sy),
    b: densityAt(sx + 1, sy),
    c: densityAt(sx + 1, sy + 1),
    d: densityAt(sx, sy + 1),
  }
  const pairs = edgePairsOf(square)
  for (let at = 0; at < pairs.length; at += 2) {
    writeCrossing(segments, square, pairs[at])
    writeCrossing(segments, square, pairs[at + 1])
  }
}

function edgePairsOf(square: Square): readonly Edge[] {
  const code =
    (isSolid(square.a) ? 1 : 0) |
    (isSolid(square.b) ? 2 : 0) |
    (isSolid(square.c) ? 4 : 0) |
    (isSolid(square.d) ? 8 : 0)
  if (code === 5 && !isSolidMiddle(square)) return [3, 0, 1, 2]
  if (code === 10 && !isSolidMiddle(square)) return [0, 1, 2, 3]
  return EDGE_PAIRS[code]
}

function isSolid(density: number): boolean {
  return density >= ISO_DENSITY
}

function isSolidMiddle(square: Square): boolean {
  return square.a + square.b + square.c + square.d >= 4 * ISO_DENSITY
}

function writeCrossing(segments: number[], square: Square, edge: Edge): void {
  const { sx, sy } = square
  if (edge === 0) segments.push(...pointAlong(sx, sy, sx + 1, sy, square.a, square.b))
  else if (edge === 1) segments.push(...pointAlong(sx + 1, sy, sx + 1, sy + 1, square.b, square.c))
  else if (edge === 2) segments.push(...pointAlong(sx + 1, sy + 1, sx, sy + 1, square.c, square.d))
  else segments.push(...pointAlong(sx, sy + 1, sx, sy, square.d, square.a))
}

/** Where 128 falls between two samples, in metres. */
function pointAlong(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  from: number,
  to: number,
): [number, number] {
  const t = (ISO_DENSITY - from) / (to - from)
  return [(x0 + (x1 - x0) * t) * METRES_PER_SAMPLE, (y0 + (y1 - y0) * t) * METRES_PER_SAMPLE]
}
