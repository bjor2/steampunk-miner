/**
 * Spec plumbing for the ore pickup routes (ticket 509): turns generated ore cells into cells `lead`
 * tiers above their own band's ore, family kept, the way an ore mover overrides a cell. A route
 * spec can then pick up an epic or mythic find on any planet, where the planet itself generated
 * none at that spot. Only specs use it.
 */
import { bandOfTile } from '../world/planetGeometry'
import type { PlanetParams } from '../world/planetParams'
import { swapTileCells } from '../world/terrainCellEdits'
import type { TilePoint } from '../world/tileGrid'
import { familyOfCell, oreCell } from '../world/worldCell'
import { cellAt } from '../world/worldState'
import type { AuthorityState } from './authorityState'

/** An epic find: three tiers above its band (`ores.economy.json` rarity tiers). */
export const EPIC_LEAD = 3

export function withOreLeadAt(
  state: AuthorityState,
  params: PlanetParams,
  tiles: readonly TilePoint[],
  lead: number,
): AuthorityState {
  const swaps = tiles.map((tile) => ({ ...tile, cell: leadCellAt(state, params, tile, lead) }))
  return { ...state, world: swapTileCells(state.world, swaps).world }
}

function leadCellAt(
  state: AuthorityState,
  params: PlanetParams,
  tile: TilePoint,
  lead: number,
): number {
  const band = bandOfTile(params, tile.tx, tile.ty)
  const family = familyOfCell(cellAt(state.world, params, tile))
  return oreCell(family, band - 1 + lead)
}
