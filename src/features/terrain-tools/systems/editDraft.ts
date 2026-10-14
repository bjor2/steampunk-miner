/**
 * One terrain edit while a tool plans it: the cells it will change, in order, and what is left of
 * its cap. The TD's caps (#162 section 3, the endless Mark cap) are counted in the K6 queue's own
 * units, so one activation edits at most 32 density cells or 64 swaps whatever its Mark, and a
 * lodestone beacon at most 256 swaps. A step the cap cannot pay is never half taken. A mover's
 * draft also keeps the trip ledger (`moverLedger.ts`, ticket 408): each ore move banks the ore's
 * value, and a nodule the trip has no room for stays where it is.
 */
import {
  DENSITY_CELL_UNITS,
  SWAP_CELL_UNITS,
  TERRAIN_EDIT_UNITS_PER_TICK,
} from '../../../constants/terrainBudget'
import type { TerrainCellEdit } from '../../../systems/authority/terrain/terrainEdits'
import type { Money } from '../../../systems/money'
import type { TilePoint } from '../../../systems/world/tileGrid'
import { markMoved, markOpened, materialNow, type GroundView } from './groundView'
import {
  bank,
  bankedOreOf,
  canBank,
  holdBack,
  isHeldByCap,
  openMoverLedger,
  oreValueOfCell,
  type BankedOre,
  type MoverLedger,
} from './moverLedger'

/** "At most 32 density cells or 64 swaps per activation" (TD, #162): one tick's units. */
export const ACTIVATION_UNIT_CAP = TERRAIN_EDIT_UNITS_PER_TICK

/** What opening a tile costs, and what moving one material cell onto another costs. */
export const OPEN_UNITS = DENSITY_CELL_UNITS
export const MOVE_UNITS = 2 * SWAP_CELL_UNITS

export interface EditDraft {
  view: GroundView
  cells: TerrainCellEdit[]
  unitsLeft: number
  /** The trip ledger a mover's ore moves bank on; null for a tool that moves no ore for income. */
  ledger: MoverLedger | null
}

/** A planned edit's cells, with the ore a mover banked on the trip (null for none). */
export interface BankedEdit {
  cells: readonly TerrainCellEdit[]
  banked: BankedOre | null
}

export function openDraft(view: GroundView, unitCap: number): EditDraft {
  return { view, cells: [], unitsLeft: unitCap, ledger: null }
}

/** A mover's draft, its ore moves banked on the trip under the cap of the band at `at`. */
export function openMoverDraft(view: GroundView, unitCap: number, at: TilePoint): EditDraft {
  return { ...openDraft(view, unitCap), ledger: openMoverLedger(view, at) }
}

export function canAfford(draft: EditDraft, units: number): boolean {
  return units <= draft.unitsLeft
}

/** Whether the trip has room for the ore at `from`; a draft with no ledger always has. */
export function canBankOreAt(draft: EditDraft, from: TilePoint): boolean {
  return draft.ledger === null || canBank(draft.ledger, valueOfOreAt(draft, from))
}

/** The nodule stays where it is: the trip cap has no room for it. */
export function holdBackOre(draft: EditDraft): void {
  if (draft.ledger !== null) holdBack(draft.ledger)
}

export function bankedEditOf(draft: EditDraft): BankedEdit {
  return { cells: draft.cells, banked: draft.ledger === null ? null : bankedOreOf(draft.ledger) }
}

/** Whether a nodule stayed because the trip cap had no room for it. */
export function isHeldByTripCap(draft: EditDraft): boolean {
  return draft.ledger !== null && isHeldByCap(draft.ledger)
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
  if (draft.ledger !== null) bank(draft.ledger, oreValueOfCell(draft.view, from, moving))
  markMoved(draft.view, to, moving)
  markMoved(draft.view, from, displaced)
}

function valueOfOreAt(draft: EditDraft, from: TilePoint): Money {
  return oreValueOfCell(draft.view, from, materialNow(draft.view, from))
}
