/**
 * The bot's mine on one planet (#29): one vertical shaft just east of the pad (past the Upgrade
 * bay, #37) and horizontal
 * galleries off it, three rows apart, so each gallery tile has an untouched row above and below
 * whose ore (or core) the drill can reach without moving. The bot remembers how far each gallery
 * reaches; the authority's world is the truth about what is open.
 */
import { bandOfTile, isCoreTile, isInsidePlanet } from '../world/planetGeometry'
import { bayRestTileOf, hasBay } from '../world/dockBays'
import type { DockSite } from '../world/dockSite'
import type { PlanetParams } from '../world/planetParams'
import { surfaceRowOfColumn, type TilePoint } from '../world/tileGrid'

export type GallerySide = 'east' | 'west'

/** How far a gallery reaches from the shaft on each side, and whether a side has hit its end. */
export interface Gallery {
  east: number
  west: number
  isEastDone: boolean
  isWestDone: boolean
}

export interface MineLayout {
  params: PlanetParams
  shaftColumn: number
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
}

/** Galleries are three rows apart, starting two rows under the shaft's surface tile. */
const GALLERY_SPACING_ROWS = 3
const FIRST_GALLERY_DEPTH = 2
/** A gallery stops this many rows short of breaking out of the planet's surface. */
const SURFACE_MARGIN_ROWS = 2

export function newMineLayout(params: PlanetParams, site: DockSite): MineLayout {
  const travelRow = site.padRow + 1
  return {
    params,
    shaftColumn: site.lastColumn + 2,
    travelRow,
    sellBay: bayRestTileOf(site, 'sell'),
    upgradeBay: bayRestTileOf(site, 'upgrade'),
    refineryBay: hasBay(site, 'refinery') ? bayRestTileOf(site, 'refinery') : null,
    shaftBottomRow: travelRow,
    galleries: new Map(),
  }
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
  return { tx: layout.shaftColumn, ty: row }
}

export function bandOfRow(layout: MineLayout, row: number): number {
  return bandOfTile(layout.params, layout.shaftColumn, row)
}

/** The tile a gallery side bores next. */
export function galleryFaceOf(layout: MineLayout, row: number, side: GallerySide): TilePoint {
  const gallery = galleryOf(layout, row)
  const reach = side === 'east' ? gallery.east + 1 : -(gallery.west + 1)
  return { tx: layout.shaftColumn + reach, ty: row }
}

/** The open end of a gallery side, where the vehicle stands to bore its face. */
export function galleryEndOf(layout: MineLayout, row: number, side: GallerySide): TilePoint {
  const gallery = galleryOf(layout, row)
  const reach = side === 'east' ? gallery.east : -gallery.west
  return { tx: layout.shaftColumn + reach, ty: row }
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

/** The core galleries run toward the planet's centre, across the core disc. */
export function coreSideOf(layout: MineLayout): GallerySide {
  return layout.shaftColumn > 0 ? 'west' : 'east'
}
