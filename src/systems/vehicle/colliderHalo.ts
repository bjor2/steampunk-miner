/**
 * The exposed-tile collider halo (decision #4, #7): physics only ever needs colliders for solid
 * tiles that touch air, and only near the vehicle. With the speed under 0.3 m per tick (#7) and
 * the halo rebuilt whenever the vehicle enters a new tile, a few tiles of radius always cover
 * every tile it could reach next, so no continuous collision detection is needed.
 */
import type { TilePoint } from '../world/tileGrid'

export type IsSolidAt = (tile: TilePoint) => boolean

const NEIGHBOUR_OFFSETS: readonly TilePoint[] = [
  { tx: 1, ty: 0 },
  { tx: -1, ty: 0 },
  { tx: 0, ty: 1 },
  { tx: 0, ty: -1 },
]

/** Solid tiles with at least one non-solid side, in the square of `radius` tiles around `centre`. */
export function exposedTilesAround(
  centre: TilePoint,
  radius: number,
  isSolidAt: IsSolidAt,
): TilePoint[] {
  const tiles: TilePoint[] = []
  for (let ty = centre.ty - radius; ty <= centre.ty + radius; ty++) {
    for (let tx = centre.tx - radius; tx <= centre.tx + radius; tx++) {
      if (isExposedTile({ tx, ty }, isSolidAt)) tiles.push({ tx, ty })
    }
  }
  return tiles
}

function isExposedTile(tile: TilePoint, isSolidAt: IsSolidAt): boolean {
  if (!isSolidAt(tile)) return false
  return NEIGHBOUR_OFFSETS.some(
    (offset) => !isSolidAt({ tx: tile.tx + offset.tx, ty: tile.ty + offset.ty }),
  )
}
