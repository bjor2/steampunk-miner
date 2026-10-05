/**
 * Which chunks to draw (#4 Rendering): the camera rotates, so the view is culled by a circle of
 * half the screen diagonal around the camera, not by the screen rectangle. Chunks that hold no
 * tile of the planet's disc are skipped, and the rest come nearest first, so a refill draws the
 * middle of the screen before its corners.
 */
import type { Vector2 } from '../vehicle/localFrame'
import { CHUNK_SIZE } from '../world/tileGrid'

export interface ChunkPoint {
  cx: number
  cy: number
}

/** Half the screen diagonal in world metres: every pixel at any rotation lies inside it. */
export function viewRadiusOf(widthPixels: number, heightPixels: number, zoom: number): number {
  return Math.sqrt(widthPixels * widthPixels + heightPixels * heightPixels) / 2 / zoom
}

export function visibleChunksAround(
  centre: Vector2,
  viewRadius: number,
  planetRadiusTiles: number,
): ChunkPoint[] {
  return visibleSquaresAround(centre, viewRadius, planetRadiusTiles, CHUNK_SIZE).map(
    ({ column, row }) => ({ cx: column, cy: row }),
  )
}

/** A square of the world grid `side` metres wide: column and row count from the planet's centre. */
export interface GridSquare {
  column: number
  row: number
}

/**
 * The world squares of a grid of `side` metres that the view circle touches and that hold a
 * tile of the planet's disc, nearest first. Chunks (32 m) and ground blocks (8 m) share it.
 */
export function visibleSquaresAround(
  centre: Vector2,
  viewRadius: number,
  planetRadiusTiles: number,
  side: number,
): GridSquare[] {
  const squares: GridSquare[] = []
  const first = (value: number) => Math.floor((value - viewRadius) / side)
  const last = (value: number) => Math.floor((value + viewRadius) / side)
  for (let row = first(centre.y); row <= last(centre.y); row++) {
    for (let column = first(centre.x); column <= last(centre.x); column++) {
      const square = { column, row }
      if (isSquareWorthDrawing(square, side, centre, viewRadius, planetRadiusTiles))
        squares.push(square)
    }
  }
  return squares.sort(
    (a, b) => centreDistanceSq(a, side, centre) - centreDistanceSq(b, side, centre),
  )
}

function isSquareWorthDrawing(
  square: GridSquare,
  side: number,
  centre: Vector2,
  viewRadius: number,
  planetRadiusTiles: number,
): boolean {
  const isInView = squareDistanceSq(square, side, centre) <= viewRadius * viewRadius
  const planetCentre = { x: 0, y: 0 }
  return (
    isInView &&
    squareDistanceSq(square, side, planetCentre) <= planetRadiusTiles * planetRadiusTiles
  )
}

/** Squared distance from a point to the nearest point of the square. */
function squareDistanceSq(square: GridSquare, side: number, point: Vector2): number {
  const dx = gapToSpan(point.x, square.column * side, side)
  const dy = gapToSpan(point.y, square.row * side, side)
  return dx * dx + dy * dy
}

function gapToSpan(value: number, spanStart: number, side: number): number {
  return Math.max(spanStart - value, 0, value - (spanStart + side))
}

function centreDistanceSq(square: GridSquare, side: number, point: Vector2): number {
  const dx = (square.column + 0.5) * side - point.x
  const dy = (square.row + 0.5) * side - point.y
  return dx * dx + dy * dy
}
