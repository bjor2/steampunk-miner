/**
 * Which part of the planet a tile is in (decision #4 Geometry): inside the disc or in space, in
 * which of the five depth bands, inside the core disc. Integer comparisons only.
 */
import type { PlanetParams } from './planetParams'
import { discTileCount, halfTileDistanceSq, isInsideDisc, surfaceRowOfColumn } from './tileGrid'

export const BAND_COUNT = 5

export function isInsidePlanet(params: PlanetParams, tx: number, ty: number): boolean {
  return isInsideDisc(tx, ty, params.radiusTiles)
}

export function isCoreTile(params: PlanetParams, tx: number, ty: number): boolean {
  return isInsideDisc(tx, ty, params.coreRadiusTiles)
}

/** Band 1 (surface soil) to 5 (core region) of a tile inside the disc. */
export function bandOfTile(params: PlanetParams, tx: number, ty: number): number {
  return bandAtHalfTileDistanceSq(params, halfTileDistanceSq(tx, ty))
}

export function bandAtHalfTileDistanceSq(params: PlanetParams, distanceSq: number): number {
  let band = 1
  for (const start of params.bandStartsHalfTileSq) {
    if (distanceSq <= start) band++
  }
  return band
}

/** #4 `coreTileCount(params)`: 156 on planet 1 and 316 from planet 2 on (#6 section 2). */
export function coreTileCount(params: PlanetParams): number {
  return discTileCount(params.coreRadiusTiles)
}

/** Whole tiles below the surface of a tile's column, 0 above it: the run log's `depthTiles`. */
export function depthTilesAt(params: PlanetParams, tx: number, ty: number): number {
  return Math.max(0, surfaceRowOfColumn(tx, params.radiusTiles) - ty)
}
