/**
 * `generateChunk(params, cx, cy)` (decision #4): the 1024 packed cells of one 32x32 chunk, a pure
 * function of the planet params and the chunk coordinates. The seeded terrain comes first, then
 * the placed features stamp over it: the dock pad and its clearance (#8), then the starter vein
 * (#16). Each feature is a function of the params alone, so stamping per chunk gives the same
 * planet in any order.
 */
import { generateBaseTerrain } from './baseTerrain'
import { dockSiteTiles } from './dockSite'
import type { PlanetParams } from './planetParams'
import { starterVeinTiles } from './starterVein'
import { cellIndexOfTile, chunkOfTile, type PlacedTile } from './tileGrid'

export function generateChunk(params: PlanetParams, cx: number, cy: number): Uint32Array {
  const cells = generateBaseTerrain(params, cx, cy)
  stampTilesInChunk(cells, dockSiteTiles(params), cx, cy)
  stampTilesInChunk(cells, starterVeinTiles(params), cx, cy)
  return cells
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
