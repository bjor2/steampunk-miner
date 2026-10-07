/**
 * The power-up terrain edits waiting in the world's shared per-tick queue (Technical Director, K6
 * #189 and #162 section 3): a slice's command queues an edit, as cells to change, and the clock
 * applies them a share a tick (`terrainEditPlan.ts`). First in first out per player, plain JSON, so
 * the queue is in the snapshot and the digest; emptied with the world on every planet.
 */
import { SOLID_DENSITY } from '../../world/sampleGrid'
import type { AuthorityState } from '../authorityState'
import { isJsonObject, isWholeNumber } from '../payloadFields'

/** One tile's change: its unlined samples to one density, or its material to another cell. */
export type TerrainCellEdit =
  | { kind: 'density'; tx: number; ty: number; density: number }
  | { kind: 'swap'; tx: number; ty: number; cell: number }

export interface QueuedTerrainEdit {
  playerId: string
  /** What asked for it, `<slice>.<item>`, so a slice knows its own edit. */
  source: string
  /** The cells still to change, in the order the edit gave them. */
  cells: readonly TerrainCellEdit[]
}

export const NO_TERRAIN_EDITS: readonly QueuedTerrainEdit[] = []

/** The edit joins the end of the queue; the clock starts on it at the next tick. */
export function queueTerrainEdit(state: AuthorityState, edit: QueuedTerrainEdit): AuthorityState {
  return { ...state, terrainEdits: [...state.terrainEdits, edit] }
}

/** The next tick the queue moves, or null when it is empty. */
export function nextTerrainEditTick(state: AuthorityState): number | null {
  return state.terrainEdits.length === 0 ? null : state.tick + 1
}

export function portableTerrainEditsOf(edits: readonly QueuedTerrainEdit[]): QueuedTerrainEdit[] {
  return edits.map((edit) => ({ ...edit, cells: edit.cells.map((cell) => ({ ...cell })) }))
}

export function portableTerrainEditsProblems(edits: unknown, path: string): string[] {
  if (!Array.isArray(edits)) return [`${path} must be a list of terrain edits`]
  return edits
    .map((edit, index) => ({ edit, index }))
    .filter(({ edit }) => !isQueuedTerrainEdit(edit))
    .map(({ index }) => `${path}[${index}] is malformed`)
}

function isQueuedTerrainEdit(edit: unknown): boolean {
  return (
    isJsonObject(edit) &&
    typeof edit.playerId === 'string' &&
    typeof edit.source === 'string' &&
    Array.isArray(edit.cells) &&
    edit.cells.every(isTerrainCellEdit)
  )
}

function isTerrainCellEdit(cell: unknown): boolean {
  if (!isJsonObject(cell) || !Number.isSafeInteger(cell.tx) || !Number.isSafeInteger(cell.ty)) {
    return false
  }
  if (cell.kind === 'swap') return isWholeNumber(cell.cell)
  return (
    cell.kind === 'density' &&
    isWholeNumber(cell.density) &&
    (cell.density as number) <= SOLID_DENSITY
  )
}
