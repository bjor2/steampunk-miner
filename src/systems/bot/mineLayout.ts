/**
 * The bot's mine on one planet (#29): one vertical shaft just off the pad's edge nearer the hub
 * (east of the slice pad, past the Upgrade bay, #37; west of the Sell bay once the pad runs on
 * under the Refinery bay, #105, so the walk from the hub stays as short as on the slice) and horizontal
 * galleries off it, three rows apart, so each gallery tile has an untouched row above and below
 * whose ore (or core) the drill can reach without moving. The bot remembers how far each gallery
 * reaches; the authority's world is the truth about what is open.
 *
 * On a heat planet the shaft steps sideways round lava (#113): where the next tile down would open
 * a pocket, the bot bores along the shaft's bottom row to a clear column and carries on down
 * there. Each such jog is remembered; a row's shaft tile is in the column of the last jog at or
 * above it. On a planet without lava the shaft is one straight column, as before.
 */
import { bandOfTile, isCoreTile, isInsidePlanet } from '../world/planetGeometry'
import { bayRestTileOf, hasBay } from '../world/dockBays'
import type { DockSite } from '../world/dockSite'
import type { PlanetParams } from '../world/planetParams'
import { surfaceRowOfColumn, type TilePoint } from '../world/tileGrid'

export type GallerySide = 'east' | 'west'

/** The shaft runs on in `column` from `row` down, after a sideways step along `row`. */
export interface ShaftJog {
  row: number
  column: number
}

/** How far a gallery reaches from the shaft on each side, and whether a side has hit its end. */
export interface Gallery {
  east: number
  west: number
  isEastDone: boolean
  isWestDone: boolean
}

export interface MineLayout {
  params: PlanetParams
  /** The shaft's column at the top; `shaftJogs` move it lower down. */
  shaftColumn: number
  /** The shaft's sideways steps round lava, deepest last (#113). */
  shaftJogs: ShaftJog[]
  /** The row just above the pad: the bot drives along it between the bays and the shaft. */
  travelRow: number
  /** Where the bot docks to sell (every return) and to buy (#37), one tile in each bay. */
  sellBay: TilePoint
  upgradeBay: TilePoint
  /** Where the bot docks to refine (#105), on the planets whose pad has the Refinery bay. */
  refineryBay: TilePoint | null
  /** The lowest row the shaft is open down to; the vehicle can stand anywhere above it. */
  shaftBottomRow: number
  galleries: Map<number, Gallery>
  /** How far a band's ore galleries reach once the bot has widened them (#216). */
  oreReachByBand: Map<number, number>
}

/** The shaft is this many columns off the pad, so the pad's edge tile stays whole. */
const SHAFT_OFFSET_TILES = 2
/** Galleries are three rows apart, starting two rows under the shaft's surface tile. */
const GALLERY_SPACING_ROWS = 3
const FIRST_GALLERY_DEPTH = 2
/** A gallery stops this many rows short of breaking out of the planet's surface. */
const SURFACE_MARGIN_ROWS = 2
/**
 * Ore galleries end this far from the shaft: a deeper gallery is a shorter walk than a long one,
 * and a band has rows to spare (#6 band thresholds: band 2 alone is 27% of the radius). A band
 * whose rows are all bored out is widened by this much again (#216).
 */
export const ORE_GALLERY_REACH = 20

export function newMineLayout(params: PlanetParams, site: DockSite): MineLayout {
  const travelRow = site.padRow + 1
  return {
    params,
    shaftColumn: shaftColumnOf(site),
    shaftJogs: [],
    travelRow,
    sellBay: bayRestTileOf(site, 'sell'),
    upgradeBay: bayRestTileOf(site, 'upgrade'),
    refineryBay: hasBay(site, 'refinery') ? bayRestTileOf(site, 'refinery') : null,
    shaftBottomRow: travelRow,
    galleries: new Map(),
    oreReachByBand: new Map(),
  }
}

/** Two tiles past the pad edge nearer the dock point; east when both are as near. */
function shaftColumnOf(site: DockSite): number {
  const westReach = site.dockPoint.tx - site.firstColumn
  const eastReach = site.lastColumn + 1 - site.dockPoint.tx
  return westReach < eastReach
    ? site.firstColumn - SHAFT_OFFSET_TILES
    : site.lastColumn + SHAFT_OFFSET_TILES
}

export function galleryOf(layout: MineLayout, row: number): Gallery {
  const existing = layout.galleries.get(row)
  if (existing !== undefined) return existing
  const fresh = { east: 0, west: 0, isEastDone: false, isWestDone: false }
  layout.galleries.set(row, fresh)
  return fresh
}

/** Every gallery row from the top of the shaft down to the bottom of the planet. */
export function galleryRows(layout: MineLayout): number[] {
  const { radiusTiles } = layout.params
  const top = surfaceRowOfColumn(layout.shaftColumn, radiusTiles) - FIRST_GALLERY_DEPTH
  const rows: number[] = []
  for (let row = top; row > -radiusTiles; row -= GALLERY_SPACING_ROWS) rows.push(row)
  return rows
}

export function shaftTileAt(layout: MineLayout, row: number): TilePoint {
  return { tx: shaftColumnAt(layout, row), ty: row }
}

/** The shaft's column at `row`: the last jog's at or above it, else the top column. */
export function shaftColumnAt(layout: MineLayout, row: number): number {
  return layout.shaftJogs.reduce(
    (column, jog) => (row <= jog.row ? jog.column : column),
    layout.shaftColumn,
  )
}

/** The tiles of the shaft's way from `fromRow` to `toRow`: corners at each jog between, in order. */
export function shaftWaypoints(layout: MineLayout, fromRow: number, toRow: number): TilePoint[] {
  const isDown = toRow < fromRow
  const jogs = layout.shaftJogs.filter(
    (jog) => jog.row <= Math.max(fromRow, toRow) && jog.row >= Math.min(fromRow, toRow),
  )
  const ordered = isDown ? jogs : [...jogs].reverse()
  const corners = ordered.flatMap((jog) => {
    const above = shaftColumnAt(layout, jog.row + 1)
    const pair = [
      { tx: above, ty: jog.row },
      { tx: jog.column, ty: jog.row },
    ]
    return isDown ? pair : pair.reverse()
  })
  return [...corners, shaftTileAt(layout, toRow)]
}

/** Tiles walked sideways along the jogs at or above `row`, for the way home's energy. */
export function shaftJogLengthAbove(layout: MineLayout, row: number): number {
  return layout.shaftJogs
    .filter((jog) => jog.row >= row)
    .reduce((length, jog) => length + Math.abs(jog.column - shaftColumnAt(layout, jog.row + 1)), 0)
}

export function bandOfRow(layout: MineLayout, row: number): number {
  return bandOfTile(layout.params, shaftColumnAt(layout, row), row)
}

/** The tile a gallery side bores next. */
export function galleryFaceOf(layout: MineLayout, row: number, side: GallerySide): TilePoint {
  const gallery = galleryOf(layout, row)
  const reach = side === 'east' ? gallery.east + 1 : -(gallery.west + 1)
  return { tx: shaftColumnAt(layout, row) + reach, ty: row }
}

/** The open end of a gallery side, where the vehicle stands to bore its face. */
export function galleryEndOf(layout: MineLayout, row: number, side: GallerySide): TilePoint {
  const gallery = galleryOf(layout, row)
  const reach = side === 'east' ? gallery.east : -gallery.west
  return { tx: shaftColumnAt(layout, row) + reach, ty: row }
}

export function isSideDone(layout: MineLayout, row: number, side: GallerySide): boolean {
  const gallery = galleryOf(layout, row)
  return side === 'east' ? gallery.isEastDone : gallery.isWestDone
}

export function markSideDone(layout: MineLayout, row: number, side: GallerySide): void {
  const gallery = galleryOf(layout, row)
  if (side === 'east') gallery.isEastDone = true
  else gallery.isWestDone = true
}

export function extendSide(layout: MineLayout, row: number, side: GallerySide): void {
  const gallery = galleryOf(layout, row)
  if (side === 'east') gallery.east += 1
  else gallery.west += 1
}

/** How far the band's ore galleries reach from the shaft. */
export function oreReachOf(layout: MineLayout, band: number): number {
  return layout.oreReachByBand.get(band) ?? ORE_GALLERY_REACH
}

/**
 * Widens the shallowest band down to `deepestBand` that has a side ended at its reach (#216);
 * false when none has.
 */
export function widenShallowestBand(layout: MineLayout, deepestBand: number): boolean {
  for (let band = 1; band <= deepestBand; band++) {
    if (widenBandGalleries(layout, band)) return true
  }
  return false
}

/**
 * Lets the band's ore galleries reach one `ORE_GALLERY_REACH` further, reopening every side that
 * ended at the old reach (one that met the surface, the core or a tile it cannot bore stays done);
 * false when no side of the band ended there.
 */
function widenBandGalleries(layout: MineLayout, band: number): boolean {
  const reach = oreReachOf(layout, band)
  const sides = sidesEndedAtReach(layout, band, reach)
  if (sides.length === 0) return false
  layout.oreReachByBand.set(band, reach + ORE_GALLERY_REACH)
  for (const { gallery, side } of sides) reopenSide(gallery, side)
  return true
}

const SIDES: readonly GallerySide[] = ['east', 'west']

function sidesEndedAtReach(
  layout: MineLayout,
  band: number,
  reach: number,
): { gallery: Gallery; side: GallerySide }[] {
  return [...layout.galleries]
    .filter(([row]) => isOreRowOfBand(layout, row, band))
    .flatMap(([, gallery]) =>
      SIDES.filter((side) => isSideEndedAt(gallery, side, reach)).map((side) => ({
        gallery,
        side,
      })),
    )
}

function isOreRowOfBand(layout: MineLayout, row: number, band: number): boolean {
  return !isCoreRow(layout, row) && bandOfRow(layout, row) === band
}

/** The reach check comes first at a face, so a side that stopped there reaches exactly `reach`. */
function isSideEndedAt(gallery: Gallery, side: GallerySide, reach: number): boolean {
  return side === 'east'
    ? gallery.isEastDone && gallery.east === reach
    : gallery.isWestDone && gallery.west === reach
}

function reopenSide(gallery: Gallery, side: GallerySide): void {
  if (side === 'east') gallery.isEastDone = false
  else gallery.isWestDone = false
}

/** The open side with the shorter walk, or null when both have ended. */
export function openSideOf(layout: MineLayout, row: number): GallerySide | null {
  const gallery = galleryOf(layout, row)
  if (gallery.isEastDone && gallery.isWestDone) return null
  if (gallery.isEastDone) return 'west'
  if (gallery.isWestDone) return 'east'
  return gallery.west < gallery.east ? 'west' : 'east'
}

/** Whether a face tile is past the planet's skin: too close to the surface to bore safely. */
export function isNearSurface(layout: MineLayout, tile: TilePoint): boolean {
  return !isInsidePlanet(layout.params, tile.tx, tile.ty + SURFACE_MARGIN_ROWS)
}

export function isCoreRow(layout: MineLayout, row: number): boolean {
  const { coreRadiusTiles } = layout.params
  return row < coreRadiusTiles && row >= -coreRadiusTiles
}

/** Whether a tile lies in the core disc (#10), whatever the drill has done to it. */
export function isCoreTileAt(layout: MineLayout, tile: TilePoint): boolean {
  return isCoreTile(layout.params, tile.tx, tile.ty)
}

/**
 * The core galleries run first toward the planet's centre, as seen from the shaft's top column; a
 * jog round lava can carry the shaft past the middle, and the far sides then hold the rest (#136).
 */
export function coreSideOf(layout: MineLayout): GallerySide {
  return layout.shaftColumn > 0 ? 'west' : 'east'
}

export function oppositeSideOf(side: GallerySide): GallerySide {
  return side === 'east' ? 'west' : 'east'
}
