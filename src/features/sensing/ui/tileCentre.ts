/** A tile's centre as the overlay's projector reads it: a tile is a metre (#4), world units. */
import type { Vec2 } from '../../../ui/projection/worldToScreen'
import type { TilePoint } from '../../../systems/world/tileGrid'

const HALF_TILE = 0.5

export function tileCentreOf(tile: TilePoint): Vec2 {
  return { x: tile.tx + HALF_TILE, y: tile.ty + HALF_TILE }
}
