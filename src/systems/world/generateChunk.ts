/**
 * `generateChunk(params, cx, cy)` (decisions #4, #36): the 1024 packed material cells of one 32x32
 * chunk and its 128x128 density samples, a pure function of the planet params and the chunk
 * coordinates. The seeded terrain comes first, then ore patches stamp over it (#42, the dock
 * guarantee after the band-1 patches; under ore rules 10 a rare patch paints its 1-3 cell cluster,
 * ticket 737), then the guaranteed rare clusters, then a heat planet's lava pockets (#113), then the slices'
 * generation hooks paint (feature-slices.md 3.8; none registered leaves the cells unchanged), then
 * the placed features: the dock pad and its clearance
 * (#8), the starter vein (#16), then the artefact cache (#46). The density follows from the finished cells. Each step is a
 * function of the params alone, so stamping per chunk gives the same planet in any order.
 */
import { foldOreCell, paintGenerationHooks } from '../registries/generationHooks'
import { artefactCacheTiles } from './artefactCache'
import { generateBaseTerrain } from './baseTerrain'
import { dockGuaranteePatch } from './dockGuarantee'
import { dockSiteTiles } from './dockSite'
import { generateDensity } from './generateDensity'
import { guaranteedClusterTiles } from './guaranteedClusters'
import { paintLavaPockets } from './lavaPockets'
import { orePatchesNearChunk, type OrePatch } from './orePatches'
import { patchCellOf } from './patchCell'
import type { PlanetParams } from './planetParams'
import { bandOfTile } from './planetGeometry'
import { oreTilesOfPatch } from './rareClusters'
import { starterVeinTiles } from './starterVein'
import { cellIndexOfTile, chunkOfTile, type PlacedTile } from './tileGrid'
import { GROUND_CELL } from './worldCell'

/** Readers that paint a patch the way generation does (the hazard strip, the roster) import it here. */
export { patchCellOf }

export interface GeneratedChunk {
  cells: Uint32Array
  density: Uint8Array
}

export function generateChunk(params: PlanetParams, cx: number, cy: number): GeneratedChunk {
  const cells = generateChunkCells(params, cx, cy)
  return { cells, density: generateDensity(params, cx, cy, cells) }
}

/** The material cells alone: rules that only ask what a tile is skip the density. */
export function generateChunkCells(params: PlanetParams, cx: number, cy: number): Uint32Array {
  const cells = generateBaseTerrain(params, cx, cy)
  paintOrePatches(params, cells, patchesForChunk(params, cx, cy), cx, cy)
  paintGuaranteedClusters(params, cells, cx, cy)
  paintLavaPockets(params, cells, cx, cy)
  paintGenerationHooks(params, cells, cx, cy)
  stampTilesInChunk(cells, dockSiteTiles(params), cx, cy)
  stampTilesInChunk(cells, starterVeinTiles(params), cx, cy)
  stampTilesInChunk(cells, artefactCacheTiles(params), cx, cy)
  return cells
}

/**
 * The lattice patches in painting order, with the dock guarantee right after band 1's; the hazard
 * strip's seeded read (ticket 341) paints a tile from the same list.
 */
export function patchesForChunk(params: PlanetParams, cx: number, cy: number): OrePatch[] {
  const patches = orePatchesNearChunk(params, cx, cy)
  const guarantee = dockGuaranteePatch(params)
  if (guarantee === null) return patches
  const afterBandOne = patches.findIndex((patch) => patch.band > 1)
  const at = afterBandOne === -1 ? patches.length : afterBandOne
  return [...patches.slice(0, at), guarantee, ...patches.slice(at)]
}

/**
 * A patch paints plain ground of its own band only: caves, the core and other bands clip it. The
 * slices' `patchContent` and `oreCell` hooks fold over what the lattice rolled, and a rare patch
 * under ore rules 10 paints its cluster alone (ticket 737).
 */
function paintOrePatches(
  params: PlanetParams,
  cells: Uint32Array,
  patches: readonly OrePatch[],
  cx: number,
  cy: number,
): void {
  for (const patch of patches) {
    const cell = patchCellOf(params, patch)
    for (const tile of oreTilesOfPatch(params, patch, cell)) {
      if (chunkOfTile(tile.tx) !== cx || chunkOfTile(tile.ty) !== cy) continue
      const index = cellIndexOfTile(tile.tx, tile.ty)
      if (isPaintable(params, cells[index], patch.band, tile.tx, tile.ty))
        cells[index] = foldOreCell(params, tile, cell)
    }
  }
}

/** Plain ground of the patch's band; where two patches overlap, the earlier one keeps the tile. */
function isPaintable(params: PlanetParams, cell: number, band: number, tx: number, ty: number) {
  return cell === GROUND_CELL && bandOfTile(params, tx, ty) === band
}

/** Each guaranteed cluster sits on plain ground no patch reaches, so it paints every cell. */
function paintGuaranteedClusters(
  params: PlanetParams,
  cells: Uint32Array,
  cx: number,
  cy: number,
): void {
  for (const tile of guaranteedClusterTiles(params)) {
    if (chunkOfTile(tile.tx) !== cx || chunkOfTile(tile.ty) !== cy) continue
    const index = cellIndexOfTile(tile.tx, tile.ty)
    if (cells[index] === GROUND_CELL) cells[index] = tile.cell
  }
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
