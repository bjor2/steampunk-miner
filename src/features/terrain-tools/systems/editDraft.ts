/**
 * One terrain edit while a tool plans it: the cells it will change, in order, and what is left of
 * its cap. The TD's caps (#162 section 3, the endless Mark cap) are counted in the K6 queue's own
 * units, so one activation edits at most 32 density cells or 64 swaps whatever its Mark, and a
 * lodestone beacon at most 256 swaps. A step the cap cannot pay is never half taken.
 */
import {
  DENSITY_CELL_UNITS,
  SWAP_CELL_UNITS,
  TERRAIN_EDIT_UNITS_PER_TICK,
} from '../../../constants/terrainBudget'
import type { TerrainCellEdit } from '../../../systems/authority/terrain/terrainEdits'
import type { TilePoint } from '../../../systems/world/tileGrid'
import { markMoved, markOpened, materialNow, type GroundView } from './groundView'

/** "At most 32 density cells or 64 swaps per activation" (TD, #162): one tick's units. */
export const ACTIVATION_UNIT_CAP = TERRAIN_EDIT_UNITS_PER_TICK

/** What opening a tile costs, and what moving one material cell onto another costs. */
export const OPEN_UNITS = DENSITY_CELL_UNITS
export const MOVE_UNITS = 2 * SWAP_CELL_UNITS

export interface EditDraft {
  view: GroundView
  cells: TerrainCellEdit[]
  unitsLeft: number
}

export function openDraft(view: GroundView, unitCap: number): EditDraft {
  return { view, cells: [], unitsLeft: unitCap }
}

export function canAfford(draft: EditDraft, units: number): boolean {
  return units <= draft.unitsLeft
}

/** The tile's ground opens: every unlined sample to density 0. */
export function draftOpen(draft: EditDraft, tile: TilePoint): void {
  draft.cells.push({ kind: 'density', ...tile, density: 0 })
  draft.unitsLeft -= OPEN_UNITS
  markOpened(draft.view, tile)
}

/** The two tiles trade materials: ore lands on `to`, and `from` keeps the ground `to` held. */
export function draftMove(draft: EditDraft, from: TilePoint, to: TilePoint): void {
  const moving = materialNow(draft.view, from)
  const displaced = materialNow(draft.view, to)
  draft.cells.push(
    { kind: 'swap', ...to, cell: moving },
    { kind: 'swap', ...from, cell: displaced },
  )
  draft.unitsLeft -= MOVE_UNITS
  markMoved(draft.view, to, moving)
  markMoved(draft.view, from, displaced)
}
