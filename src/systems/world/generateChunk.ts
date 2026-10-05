/**
 * `generateChunk(params, cx, cy)` (decisions #4, #36): the 1024 packed material cells of one 32x32
 * chunk and its 128x128 density samples, a pure function of the planet params and the chunk
 * coordinates. The seeded terrain comes first, then ore patches stamp over it (#42, the dock
 * guarantee after the band-1 patches), then the placed features: the dock pad and its clearance
 * (#8), then the starter vein (#16). The density follows from the finished cells. Each step is a
 * function of the params alone, so stamping per chunk gives the same planet in any order.
 */
import { generateBaseTerrain } from './baseTerrain'
import { dockGuaranteePatch } from './dockGuarantee'
import { dockSiteTiles } from './dockSite'
import { generateDensity } from './generateDensity'
import { orePatchesNearChunk, type OrePatch } from './orePatches'
import type { PlanetParams } from './planetParams'
import { bandOfTile } from './planetGeometry'
import { starterVeinTiles } from './starterVein'
import { cellIndexOfTile, chunkOfTile, type PlacedTile } from './tileGrid'
import { GROUND_CELL, oreCell } from './worldCell'

export interface GeneratedChunk {
  cells: Uint32Array
  density: Uint8Array
}

export function generateChunk(params: PlanetParams, cx: number, cy: number): GeneratedChunk {
  const cells = generateBaseTerrain(params, cx, cy)
  paintOrePatches(params, cells, patchesForChunk(params, cx, cy), cx, cy)
  stampTilesInChunk(cells, dockSiteTiles(params), cx, cy)
  stampTilesInChunk(cells, starterVeinTiles(params), cx, cy)
  return { cells, density: generateDensity(params, cx, cy, cells) }
}

/** The lattice patches in painting order, with the dock guarantee right after band 1's. */
function patchesForChunk(params: PlanetParams, cx: number, cy: number): OrePatch[] {
  const patches = orePatchesNearChunk(params, cx, cy)
  const guarantee = dockGuaranteePatch(params)
  if (guarantee === null) return patches
  const afterBandOne = patches.findIndex((patch) => patch.band > 1)
  const at = afterBandOne === -1 ? patches.length : afterBandOne
  return [...patches.slice(0, at), guarantee, ...patches.slice(at)]
}

/** A patch paints plain ground of its own band only: caves, the core and other bands clip it. */
function paintOrePatches(
  params: PlanetParams,
  cells: Uint32Array,
  patches: readonly OrePatch[],
  cx: number,
  cy: number,
): void {
  for (const patch of patches) {
    const cell = oreCell(patch.family, patch.band - 1)
    for (const tile of patch.tiles) {
      if (chunkOfTile(tile.tx) !== cx || chunkOfTile(tile.ty) !== cy) continue
      const index = cellIndexOfTile(tile.tx, tile.ty)
      if (isPaintable(params, cells[index], patch.band, tile.tx, tile.ty)) cells[index] = cell
    }
  }
}

/** Plain ground of the patch's band; where two patches overlap, the earlier one keeps the tile. */
function isPaintable(params: PlanetParams, cell: number, band: number, tx: number, ty: number) {
  return cell === GROUND_CELL && bandOfTile(params, tx, ty) === band
}

function stampTilesInChunk(
  cells: Uint32Array,
  tiles: readonly PlacedTile[],
  cx: number,
  cy: number,
): void {
  for (const tile of tiles) {
    if (chunkOfTile(tile.tx) === cx && chunkOfTile(tile.ty) === cy) {
      cells[cellIndexOfTile(tile.tx, tile.ty)] = tile.cell
    }
  }
}
