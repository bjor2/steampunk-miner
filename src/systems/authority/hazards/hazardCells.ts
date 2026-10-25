/**
 * Which hazard kind a cell holds (ticket 848): a hazard a scenario placed there
 * (`placedHazards.ts`), else the planet's pocket read (`hazardPockets.ts`, ticket 652), a read of
 * the planet and the cell that a cut cell keeps, since its material stays.
 */
import { hazardPocketKindAt } from '../../registries/hazardPockets'
import type { PlanetParams } from '../../world/planetParams'
import type { TilePoint } from '../../world/tileGrid'
import { materialCellAt } from '../../world/worldState'
import type { AuthorityState } from '../authorityState'
import { placedHazardKindAt } from './placedHazards'

/** The kind of the hazard the cell `cell` at `tile` holds, or null for none. */
export function hazardKindOfCell(
  state: AuthorityState,
  params: PlanetParams,
  tile: TilePoint,
  cell: number,
): string | null {
  return placedHazardKindAt(state, tile) ?? hazardPocketKindAt(params, tile, cell)
}

/** The kind of the hazard the tile holds as the world stands, or null for none. */
export function hazardKindAtTile(
  state: AuthorityState,
  params: PlanetParams,
  tile: TilePoint,
): string | null {
  return hazardKindOfCell(state, params, tile, materialCellAt(state.world, params, tile))
}
