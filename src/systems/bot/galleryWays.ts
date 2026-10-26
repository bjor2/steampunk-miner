/**
 * The way between a tile of the bot's mine and its shaft (#29; ticket 899): which gallery holds
 * the tile, the shaft tile that gallery leaves from, how far along the gallery the tile lies, and
 * the turns of the walk there. A level gallery holds the tiles of its own row, so the way is along
 * that row, as the bot always walked it. A zigzag gallery (`zigzagLegTiles`) holds a tile on its
 * 45° legs for each tile across, so its way is those legs back to the row it leaves the shaft at:
 * √2 m a tile, climbing on thrust and drive at once along each leg that went down on the way out,
 * as `moveStraight` moves it. A tile in no gallery (the shaft, the travel row) reads as a level one
 * of its own row.
 */
import { bandOfTile } from '../world/planetGeometry'
import type { TilePoint } from '../world/tileGrid'
import { DIAGONAL_STEP_METRES } from './botWorld'
import {
  galleryRows,
  galleryTileAt,
  shaftColumnAt,
  shaftTileAt,
  zigzagLegTilesAt,
  type GallerySide,
  type MineLayout,
} from './mineLayout'
import { zigzagClimbStepsOf, zigzagDipOf, zigzagTurnReachesBetween } from './zigzagGallery'

/** The way from a tile to the shaft along its gallery. */
export interface GalleryWay {
  /** The gallery's row: where it leaves the shaft. */
  row: number
  side: GallerySide
  /** Tiles from the shaft along the gallery. */
  reach: number
  /** Metres the vehicle travels along that way. */
  metres: number
  /** The metres of it that climb on the way back to the shaft: none along a level gallery. */
  climbMetres: number
}

/** The row of the gallery that holds `tile`. */
export function galleryRowOfTile(layout: MineLayout, tile: TilePoint): number {
  if (layout.zigzagLegTiles === undefined) return tile.ty
  return galleryRows(layout).find((row) => isOnZigzag(layout, row, tile)) ?? tile.ty
}

/** The shaft tile the gallery that holds `tile` leaves from. */
export function shaftEntryOf(layout: MineLayout, tile: TilePoint): TilePoint {
  return shaftTileAt(layout, galleryRowOfTile(layout, tile))
}

export function galleryWayOf(layout: MineLayout, tile: TilePoint): GalleryWay {
  const row = galleryRowOfTile(layout, tile)
  const across = tile.tx - shaftColumnAt(layout, row)
  const side: GallerySide = across < 0 ? 'west' : 'east'
  const reach = Math.abs(across)
  const legTiles = zigzagLegTilesAt(layout, row)
  if (legTiles === null) return { row, side, reach, metres: reach, climbMetres: 0 }
  const climbMetres = zigzagClimbStepsOf(reach, legTiles) * DIAGONAL_STEP_METRES
  return { row, side, reach, metres: reach * DIAGONAL_STEP_METRES, climbMetres }
}

/**
 * The tiles a walk along the gallery off `row` on `side` passes from `fromReach` to `toReach`,
 * turning at each zigzag corner between, then the tile at `toReach`; a level gallery's straight.
 */
export function galleryWaypointsOf(
  layout: MineLayout,
  { row, side }: Pick<GalleryWay, 'row' | 'side'>,
  fromReach: number,
  toReach: number,
): TilePoint[] {
  const legTiles = zigzagLegTilesAt(layout, row)
  const reaches =
    legTiles === null ? [toReach] : zigzagTurnReachesBetween(fromReach, toReach, legTiles)
  return reaches.map((reach) => galleryTileAt(layout, row, side, reach))
}

/**
 * Whether a zigzag gallery's face lies in a band deeper than `heldBand`, the deepest the casing
 * grade holds: the gallery ends there, so a trip never meets ground its grade does not hold.
 */
export function isPastHeldBand(
  layout: MineLayout,
  row: number,
  face: TilePoint,
  heldBand: number,
): boolean {
  if (zigzagLegTilesAt(layout, row) === null) return false
  return bandOfTile(layout.params, face.tx, face.ty) > heldBand
}

/** `tile` lies on the zigzag off `row`: as far below it as the zigzag dips that far across. */
function isOnZigzag(layout: MineLayout, row: number, tile: TilePoint): boolean {
  const legTiles = zigzagLegTilesAt(layout, row)
  const reach = Math.abs(tile.tx - shaftColumnAt(layout, row))
  return legTiles !== null && reach > 0 && zigzagDipOf(reach, legTiles) === row - tile.ty
}
