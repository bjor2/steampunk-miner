/**
 * The tiles a sensing ring covers: every tile whose centre lies within the radius of the centre
 * tile's centre, in whole tiles, so every client lists the same tiles in the same order.
 */
import type { TilePoint } from '../../../systems/world/tileGrid'

/** Row by row, then column by column: the order every reveal lists its tiles in. */
export function tilesWithin(centre: TilePoint, radiusTiles: number): TilePoint[] {
  const radiusSq = radiusTiles * radiusTiles
  const tiles: TilePoint[] = []
  for (let dy = -radiusTiles; dy <= radiusTiles; dy++) {
    for (let dx = -radiusTiles; dx <= radiusTiles; dx++) {
      if (dx * dx + dy * dy <= radiusSq) tiles.push({ tx: centre.tx + dx, ty: centre.ty + dy })
    }
  }
  return tiles
}

/**
 * Every tile within the radius of any of `cells`, each once: the first cell's disc, then each next
 * cell's tiles not yet listed, so every client lists the same tiles in the same order (ticket 415).
 */
export function tilesWithinOfCells(cells: readonly TilePoint[], radiusTiles: number): TilePoint[] {
  const seen = new Set<string>()
  return cells.flatMap((cell) =>
    tilesWithin(cell, radiusTiles).filter((tile) => isFirstSighting(seen, tile)),
  )
}

/** True the first time a tile is seen; it is noted as seen. */
function isFirstSighting(seen: Set<string>, { tx, ty }: TilePoint): boolean {
  const key = `${tx},${ty}`
  if (seen.has(key)) return false
  seen.add(key)
  return true
}
