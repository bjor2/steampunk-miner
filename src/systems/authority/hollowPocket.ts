/**
 * The hollow pocket query (ticket 387, K-hollow of the TD lock on #319): whether a cell is part of
 * a pocket generation hollowed out, and still open. Ricochet shot (#319b, `hazard:hollow`) asks it
 * on the at most `bounceLegCells` cells of a bounce leg, so it is one cell read, O(1).
 *
 * Hollow is generation content, not a player action, so it is not #365's reinforcement:
 *
 * - generation must have made the cell air (the seeded caves, or a slice's generation hook), and
 *   not the dock clearance, which is air placed above the pad rather than a pocket;
 * - the cell must still be open air now, read as the gun's line of fire reads it (`cellAt`), so a
 *   pocket cell swapped back to rock or flooded by lava is no pocket while it is, and a tunnel the
 *   player opened through generated rock is open but never hollow.
 */
import { dockSiteOf, isDockClearanceTile } from '../world/dockSite'
import type { PlanetParams } from '../world/planetParams'
import { cellIndexOfTile, chunkOfTile, type TilePoint } from '../world/tileGrid'
import { CELL_KIND, kindOfCell } from '../world/worldCell'
import { cellAt, generatedChunkOf, type WorldState } from '../world/worldState'

export function isHollowPocketCell(
  world: WorldState,
  params: PlanetParams,
  tile: TilePoint,
): boolean {
  return isGeneratedPocket(params, tile) && isOpenAir(cellAt(world, params, tile))
}

function isGeneratedPocket(params: PlanetParams, tile: TilePoint): boolean {
  if (!isOpenAir(generatedCellOf(params, tile))) return false
  return !isDockClearanceTile(dockSiteOf(params), tile.tx, tile.ty)
}

function generatedCellOf(params: PlanetParams, tile: TilePoint): number {
  const { cells } = generatedChunkOf(params, chunkOfTile(tile.tx), chunkOfTile(tile.ty))
  return cells[cellIndexOfTile(tile.tx, tile.ty)]
}

/** Air inside the disc: space outside it is never a pocket. */
function isOpenAir(cell: number): boolean {
  return kindOfCell(cell) === CELL_KIND.air
}
