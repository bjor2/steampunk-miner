/**
 * The gate checks on the power-up path (#142 "Constraints on other systems", #236): a terrain
 * edit's ore cells go through `canMine` with the edit's `source` as the tool asking, and only a
 * cell no gate has a verdict on, or one a gate cuts for that tool, changes. Every other ore cell
 * of the edit stands as solid ground, whatever the edit asked; the rest of the edit goes on. With
 * no check registered nothing is asked.
 */
import { hasGateChecks } from '../../registries/gateChecks'
import type { PlanetParams } from '../../world/planetParams'
import { materialCellAt } from '../../world/worldState'
import type { AuthorityState } from '../authorityState'
import { gateOfCell, type CellGates, type GateAsker, type GatedCell } from '../cellGates'
import type { QueuedTerrainEdit, TerrainCellEdit } from './terrainEdits'

/** The edit's cells a power-up may change, in the edit's order. */
export function cellsToolMayChange(
  state: AuthorityState,
  params: PlanetParams,
  edit: QueuedTerrainEdit,
): readonly TerrainCellEdit[] {
  if (!hasGateChecks()) return edit.cells
  const asker: GateAsker = {
    state,
    playerId: edit.playerId,
    params,
    blast: null,
    tool: edit.source,
  }
  const gates: CellGates = new Map()
  return edit.cells.filter((cell) =>
    isOpenToTool(gateOfCell(gates, asker, yieldedOf(state, params, cell))),
  )
}

function yieldedOf(state: AuthorityState, params: PlanetParams, { tx, ty }: TerrainCellEdit) {
  const tile = { tx, ty }
  return { tile, cell: materialCellAt(state.world, params, tile) }
}

function isOpenToTool(gated: GatedCell | null): boolean {
  return gated === null || gated.verdict.outcome === 'cut'
}
