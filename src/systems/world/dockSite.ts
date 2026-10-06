/**
 * The dock site (decision #8, placed by #4): a flat pad of `indestructible` tiles, 12 wide and
 * centred on the top of the planet (angle 90 degrees), with 8 tiles of cleared air above it. Where
 * the platform has its Refinery bay (#105) the pad runs on to the right under that bay's zone.
 * A pure function of `PlanetParams`, so the platform lands in the same place on every run.
 */
import { lastBayColumnOf, type BayId } from './dockBays'
import type { PlanetParams } from './planetParams'
import { isInsidePlanet } from './planetGeometry'
import { surfaceRowOfColumn, type PlacedTile, type TilePoint } from './tileGrid'
import { AIR_CELL, INDESTRUCTIBLE_CELL } from './worldCell'

export interface DockSite {
  /** The tile row of the pad. */
  padRow: number
  firstColumn: number
  lastColumn: number
  /** The highest cleared row above the pad. */
  clearanceTopRow: number
  /** The tile the platform's hub stands on the middle of: just above the pad, at x = 0. */
  dockPoint: TilePoint
  /** The bays whose pad zones this pad holds (#37, #105). */
  bays: readonly BayId[]
}

/** The pad sits on the lowest surface row under it, so it is flat and fully inside the disc. */
export function dockSiteOf(params: PlanetParams): DockSite {
  const firstColumn = -params.dockHalfWidthTiles
  const lastColumn = Math.max(params.dockHalfWidthTiles - 1, lastBayColumnOf(params.dockBays))
  const padRow = lowestSurfaceRow(params, firstColumn, lastColumn)
  return {
    padRow,
    firstColumn,
    lastColumn,
    clearanceTopRow: padRow + params.dockClearanceTiles,
    dockPoint: { tx: 0, ty: padRow + 1 },
    bays: params.dockBays,
  }
}

/** The pad and the air cleared above it, as tiles that replace the generated terrain. */
export function dockSiteTiles(params: PlanetParams): PlacedTile[] {
  const site = dockSiteOf(params)
  const tiles: PlacedTile[] = []
  for (let tx = site.firstColumn; tx <= site.lastColumn; tx++) {
    tiles.push({ tx, ty: site.padRow, cell: INDESTRUCTIBLE_CELL })
    tiles.push(...clearanceTilesOfColumn(params, site, tx))
  }
  return tiles
}

/** Whether a tile is part of the pad, the one kind a drill can never remove. */
export function isDockPadTile(site: DockSite, tx: number, ty: number): boolean {
  return ty === site.padRow && tx >= site.firstColumn && tx <= site.lastColumn
}

function clearanceTilesOfColumn(params: PlanetParams, site: DockSite, tx: number): PlacedTile[] {
  const tiles: PlacedTile[] = []
  for (let ty = site.padRow + 1; ty <= site.clearanceTopRow; ty++) {
    if (isInsidePlanet(params, tx, ty)) tiles.push({ tx, ty, cell: AIR_CELL })
  }
  return tiles
}

function lowestSurfaceRow(params: PlanetParams, firstColumn: number, lastColumn: number): number {
  let row = params.radiusTiles
  for (let tx = firstColumn; tx <= lastColumn; tx++) {
    row = Math.min(row, surfaceRowOfColumn(tx, params.radiusTiles))
  }
  return row
}
