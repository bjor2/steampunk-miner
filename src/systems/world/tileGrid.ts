/**
 * The planet's square-tile grid (decision #4, Geometry): tile = 1 m, the planet centre is the
 * origin, tile (tx, ty) covers [tx, tx+1) x [ty, ty+1), and the world is stored in 32x32-tile
 * chunks. Distances are measured between tile centres in half-tile units, so every geometric test
 * is an exact integer comparison: a tile centre is (2tx+1, 2ty+1) / 2.
 */

/** Tiles per chunk side (#4). */
export const CHUNK_SIZE = 32

/** Cells per chunk; a chunk's cells are indexed `ly * CHUNK_SIZE + lx`. */
export const CHUNK_CELLS = CHUNK_SIZE * CHUNK_SIZE

export interface TilePoint {
  tx: number
  ty: number
}

/** A packed cell a placed feature (dock, starter vein) puts at a tile, over the terrain. */
export interface PlacedTile extends TilePoint {
  cell: number
}

/** Squared distance from the planet centre to the tile's centre, in half tiles squared. */
export function halfTileDistanceSq(tx: number, ty: number): number {
  const x = 2 * tx + 1
  const y = 2 * ty + 1
  return x * x + y * y
}

/** A radius in tiles as a squared half-tile distance, for comparing against tile centres. */
export function halfTileRadiusSq(radiusTiles: number): number {
  return 4 * radiusTiles * radiusTiles
}

/** The #4 integer disc test: the tile exists when its centre lies within `radiusTiles`. */
export function isInsideDisc(tx: number, ty: number, radiusTiles: number): boolean {
  return halfTileDistanceSq(tx, ty) <= halfTileRadiusSq(radiusTiles)
}

/** Number of tiles the disc test admits for a radius; the core count (#6) uses the same rule. */
export function discTileCount(radiusTiles: number): number {
  let count = 0
  for (let ty = -radiusTiles; ty < radiusTiles; ty++) count += discRowWidth(ty, radiusTiles)
  return count
}

/** The highest tile row inside the disc in column `tx` (the surface tile of that column). */
export function surfaceRowOfColumn(tx: number, radiusTiles: number): number {
  let ty = radiusTiles - 1
  while (ty >= 0 && !isInsideDisc(tx, ty, radiusTiles)) ty--
  return ty
}

export function chunkOfTile(tile: number): number {
  return Math.floor(tile / CHUNK_SIZE)
}

export function firstTileOfChunk(chunk: number): number {
  return chunk * CHUNK_SIZE
}

export function cellIndexOfTile(tx: number, ty: number): number {
  return (ty - firstTileOfChunk(chunkOfTile(ty))) * CHUNK_SIZE + (tx - chunkOfTile(tx) * CHUNK_SIZE)
}

/** The range of chunk coordinates that holds any tile of a disc of this radius. */
export function chunkRangeOfDisc(radiusTiles: number): { min: number; max: number } {
  return { min: chunkOfTile(-radiusTiles), max: chunkOfTile(radiusTiles - 1) }
}

export function chunkKey(cx: number, cy: number): string {
  return `${cx},${cy}`
}

function discRowWidth(ty: number, radiusTiles: number): number {
  let width = 0
  for (let tx = 0; tx < radiusTiles; tx++) {
    if (!isInsideDisc(tx, ty, radiusTiles)) break
    width++
  }
  return 2 * width
}
