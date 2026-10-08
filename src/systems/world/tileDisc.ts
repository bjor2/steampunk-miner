/**
 * The tiles of a disc round a tile: every tile whose centre lies within the radius of the centre
 * tile's centre, in whole tiles, row by row and then column by column, so every machine lists the
 * same tiles in the same order. The kernel's copy of the sensing ring's disc (#203), for the
 * authority's sensing queries (ticket 323).
 */
import type { TilePoint } from './tileGrid'

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
