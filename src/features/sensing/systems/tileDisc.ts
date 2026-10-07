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
