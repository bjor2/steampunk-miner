/**
 * The dock guarantee (decision #42 Placement): after the band-1 patches, if the downward cone
 * under the dock holds no ore, one extra band-1 patch of the band's mean size is stamped on the
 * cone's axis at mid-band-1 depth, so the first trip finds ore without a scanner. The only
 * exception to the band densities; a pure function of the params, so every chunk agrees on it.
 *
 * The cone: apex on the pad's top edge at x = 0 (the pad centre), axis straight down, from below
 * the pad to the band-1 floor, and as wide as `DOCK_CONE_WIDTH_AT_MID_TILES` at mid-band-1 depth.
 * Tested in doubled tile units so it is an integer comparison.
 */
import { dockSiteOf, type DockSite } from './dockSite'
import { bandPatchesInBox, patchAt, type OrePatch } from './orePatches'
import { DOCK_CONE_WIDTH_AT_MID_TILES } from './planetTable'
import type { PlanetParams } from './planetParams'
import { bandOfTile, isInsidePlanet } from './planetGeometry'
import type { TilePoint } from './tileGrid'

const DOCK_BAND = 1

interface DockCone {
  site: DockSite
  /** The axis row at mid-band-1 depth, where the guarantee patch is centred. */
  midRow: number
  /** Twice the depth of `midRow`'s centre below the pad's top edge. */
  midDepth2: number
  floorRow: number
}

/** Every chunk asks; the answer depends on the params alone, so it is kept per params object. */
const guaranteeOfParams = new WeakMap<PlanetParams, OrePatch | null>()

/** The guarantee patch, or null when the cone already holds band-1 ore. */
export function dockGuaranteePatch(params: PlanetParams): OrePatch | null {
  const known = guaranteeOfParams.get(params)
  if (known !== undefined) return known
  const patch = guaranteePatchOf(params, dockConeOf(params))
  guaranteeOfParams.set(params, patch)
  return patch
}

/** Run metadata `patch_dock_guaranteed` (#42): 1 when the guarantee fires on this planet, else 0. */
export function dockGuaranteeCount(params: PlanetParams): number {
  return dockGuaranteePatch(params) === null ? 0 : 1
}

/** Whether a tile lies in the cone under the dock, between the pad and the band-1 floor. */
export function isInDockCone(params: PlanetParams, tile: TilePoint): boolean {
  return isInCone(params, dockConeOf(params), tile)
}

function dockConeOf(params: PlanetParams): DockCone {
  const site = dockSiteOf(params)
  const floorRow = Math.floor(Math.sqrt(params.bandStartsHalfTileSq[0]) / 2)
  const midRow = Math.floor((site.padRow + floorRow) / 2)
  return { site, midRow, midDepth2: depth2Of(site, midRow), floorRow }
}

function guaranteePatchOf(params: PlanetParams, cone: DockCone): OrePatch | null {
  return hasOreInCone(params, cone) ? null : patchAt(params, DOCK_BAND, axisCentreOf(cone))
}

function axisCentreOf(cone: DockCone): TilePoint {
  return { tx: 0, ty: cone.midRow }
}

function hasOreInCone(params: PlanetParams, cone: DockCone): boolean {
  // At the floor, twice the mid depth, the cone's half width is its whole width at mid depth.
  const reach = DOCK_CONE_WIDTH_AT_MID_TILES
  const box = { x0: -reach, y0: cone.floorRow, x1: reach, y1: cone.site.padRow }
  return bandPatchesInBox(params, DOCK_BAND, box).some((patch) =>
    patch.tiles.some((tile) => isPaintedInCone(params, cone, tile)),
  )
}

/** Band 1 has no caves and no core, so a band-1 patch paints every tile of the band it covers. */
function isPaintedInCone(params: PlanetParams, cone: DockCone, tile: TilePoint): boolean {
  return (
    isInsidePlanet(params, tile.tx, tile.ty) &&
    bandOfTile(params, tile.tx, tile.ty) === DOCK_BAND &&
    isInCone(params, cone, tile)
  )
}

/** `|x| <= (width / 2) * depth / midDepth`, with x and the depths of the tile centre doubled. */
function isInCone(params: PlanetParams, cone: DockCone, tile: TilePoint): boolean {
  if (tile.ty >= cone.site.padRow || bandOfTile(params, tile.tx, tile.ty) !== DOCK_BAND) {
    return false
  }
  const x2 = Math.abs(2 * tile.tx + 1)
  return x2 * cone.midDepth2 <= DOCK_CONE_WIDTH_AT_MID_TILES * depth2Of(cone.site, tile.ty)
}

/** Twice the depth of a row's centre below the pad's top edge (`padRow + 1`). */
function depth2Of(site: DockSite, row: number): number {
  return 2 * (site.padRow + 1) - (2 * row + 1)
}
