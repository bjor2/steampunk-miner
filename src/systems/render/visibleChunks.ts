/**
 * Which chunks to draw (#4 Rendering): the camera rotates, so the view is culled by a circle of
 * half the screen diagonal around the camera, not by the screen rectangle. Chunks that hold no
 * tile of the planet's disc are skipped, and the rest come nearest first, so a refill draws the
 * middle of the screen before its corners.
 */
import type { Vector2 } from '../vehicle/localFrame'
import { CHUNK_SIZE, chunkOfTile, firstTileOfChunk } from '../world/tileGrid'

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
  const chunks: ChunkPoint[] = []
  for (
    let cy = chunkOfTile(centre.y - viewRadius);
    cy <= chunkOfTile(centre.y + viewRadius);
    cy++
  ) {
    for (
      let cx = chunkOfTile(centre.x - viewRadius);
      cx <= chunkOfTile(centre.x + viewRadius);
      cx++
    ) {
      if (isChunkWorthDrawing(cx, cy, centre, viewRadius, planetRadiusTiles))
        chunks.push({ cx, cy })
    }
  }
  return chunks.sort((a, b) => centreDistanceSq(a, centre) - centreDistanceSq(b, centre))
}

function isChunkWorthDrawing(
  cx: number,
  cy: number,
  centre: Vector2,
  viewRadius: number,
  planetRadiusTiles: number,
): boolean {
  const isInView = squareDistanceSq(cx, cy, centre) <= viewRadius * viewRadius
  return (
    isInView && squareDistanceSq(cx, cy, { x: 0, y: 0 }) <= planetRadiusTiles * planetRadiusTiles
  )
}

/** Squared distance from a point to the nearest point of the chunk's square. */
function squareDistanceSq(cx: number, cy: number, point: Vector2): number {
  const dx = gapToSpan(point.x, firstTileOfChunk(cx))
  const dy = gapToSpan(point.y, firstTileOfChunk(cy))
  return dx * dx + dy * dy
}

function gapToSpan(value: number, spanStart: number): number {
  return Math.max(spanStart - value, 0, value - (spanStart + CHUNK_SIZE))
}

function centreDistanceSq(chunk: ChunkPoint, point: Vector2): number {
  const dx = firstTileOfChunk(chunk.cx) + CHUNK_SIZE / 2 - point.x
  const dy = firstTileOfChunk(chunk.cy) + CHUNK_SIZE / 2 - point.y
  return dx * dx + dy * dy
}
