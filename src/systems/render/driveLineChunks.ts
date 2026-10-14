/**
 * The chunks the view will pass over along a drive line (TD scope c1 on #316, ticket 336): every
 * chunk the view circle touches as its centre slides from `from` to `to`, that is, every chunk
 * within the view radius of the segment, on the planet's disc. They come in the order the view
 * reaches them, by how far along the line their centres lie.
 */
import type { Vector2 } from '../vehicle/localFrame'
import { CHUNK_SIZE } from '../world/tileGrid'
import {
  isSquareOnPlanet,
  squareDistanceSq,
  type ChunkPoint,
  type GridSquare,
} from './visibleChunks'

export interface DriveLine {
  from: Vector2
  to: Vector2
}

export function chunksAlongDriveLine(
  line: DriveLine,
  viewRadius: number,
  planetRadiusTiles: number,
): ChunkPoint[] {
  const touched = candidateSquaresOf(line, viewRadius).filter((square) =>
    isPassedOver(square, line, viewRadius, planetRadiusTiles),
  )
  return sortedAlongLine(touched, line).map(({ column, row }) => ({ cx: column, cy: row }))
}

function isPassedOver(
  square: GridSquare,
  line: DriveLine,
  viewRadius: number,
  planetRadiusTiles: number,
): boolean {
  const isNearLine = segmentSquareDistanceSq(square, line) <= viewRadius * viewRadius
  return isNearLine && isSquareOnPlanet(square, CHUNK_SIZE, planetRadiusTiles)
}

/** The chunks of the segment's bounding box grown by the view radius. */
function candidateSquaresOf(line: DriveLine, viewRadius: number): GridSquare[] {
  const first = (a: number, b: number) => Math.floor((Math.min(a, b) - viewRadius) / CHUNK_SIZE)
  const last = (a: number, b: number) => Math.floor((Math.max(a, b) + viewRadius) / CHUNK_SIZE)
  const squares: GridSquare[] = []
  for (let row = first(line.from.y, line.to.y); row <= last(line.from.y, line.to.y); row++) {
    for (
      let column = first(line.from.x, line.to.x);
      column <= last(line.from.x, line.to.x);
      column++
    )
      squares.push({ column, row })
  }
  return squares
}

function sortedAlongLine(squares: GridSquare[], line: DriveLine): GridSquare[] {
  const along = (square: GridSquare) => alongLineOf(square, line)
  return squares.sort((a, b) => along(a) - along(b))
}

/** How far along the line the square's centre lies, in metres times the line's length. */
function alongLineOf({ column, row }: GridSquare, { from, to }: DriveLine): number {
  const x = (column + 0.5) * CHUNK_SIZE - from.x
  const y = (row + 0.5) * CHUNK_SIZE - from.y
  return x * (to.x - from.x) + y * (to.y - from.y)
}

/**
 * Squared distance from the segment to the square: none where they cross, else the nearest of the
 * segment's ends to the square and the square's corners to the segment (two convex shapes apart
 * are nearest at a vertex of one).
 */
function segmentSquareDistanceSq(square: GridSquare, line: DriveLine): number {
  if (doesSegmentCrossSquare(square, line)) return 0
  const ends = Math.min(
    squareDistanceSq(square, CHUNK_SIZE, line.from),
    squareDistanceSq(square, CHUNK_SIZE, line.to),
  )
  const corners = cornersOf(square).map((corner) => pointSegmentDistanceSq(corner, line))
  return Math.min(ends, ...corners)
}

function cornersOf({ column, row }: GridSquare): Vector2[] {
  const [left, bottom] = [column * CHUNK_SIZE, row * CHUNK_SIZE]
  const [right, top] = [left + CHUNK_SIZE, bottom + CHUNK_SIZE]
  return [
    { x: left, y: bottom },
    { x: right, y: bottom },
    { x: left, y: top },
    { x: right, y: top },
  ]
}

/** Liang-Barsky: the part of the segment inside each axis's slab, and whether the parts overlap. */
function doesSegmentCrossSquare({ column, row }: GridSquare, { from, to }: DriveLine): boolean {
  const [x0, x1] = slabSpanOf(from.x, to.x - from.x, column * CHUNK_SIZE)
  const [y0, y1] = slabSpanOf(from.y, to.y - from.y, row * CHUNK_SIZE)
  return Math.max(x0, y0) <= Math.min(x1, y1)
}

/** The segment's parameter span `[enter, leave]` within one chunk-wide slab; empty if enter > leave. */
function slabSpanOf(start: number, delta: number, slabStart: number): [number, number] {
  const slabEnd = slabStart + CHUNK_SIZE
  if (delta === 0) return start >= slabStart && start <= slabEnd ? [0, 1] : [1, 0]
  const a = (slabStart - start) / delta
  const b = (slabEnd - start) / delta
  return [Math.max(0, Math.min(a, b)), Math.min(1, Math.max(a, b))]
}

function pointSegmentDistanceSq(point: Vector2, { from, to }: DriveLine): number {
  const [dx, dy] = [to.x - from.x, to.y - from.y]
  const lengthSq = dx * dx + dy * dy
  const t = lengthSq === 0 ? 0 : ((point.x - from.x) * dx + (point.y - from.y) * dy) / lengthSq
  const clamped = Math.min(1, Math.max(0, t))
  const [ex, ey] = [from.x + clamped * dx - point.x, from.y + clamped * dy - point.y]
  return ex * ex + ey * ey
}
