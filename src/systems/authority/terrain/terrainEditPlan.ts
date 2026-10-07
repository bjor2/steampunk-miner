/**
 * Which queued power-up cells a tick applies (Technical Director, K6 #189; #162 section 3 and its
 * corner-edit note). Drill breaks and the live blasts' slice never wait on this queue; the power-up
 * edits share what is left for them, `TERRAIN_EDIT_UNITS_PER_TICK` (32 density cells or 64 swaps)
 * over at most `TERRAIN_EDIT_CHUNKS_PER_TICK` chunks:
 *
 * - players take turns, round-robin in the order their first edit joined the queue, and each
 *   player's edits apply first in first out;
 * - a turn takes the next chunk of the player's oldest edit, its chunks in chunk-id order
 *   (`chunkKey`, as collapse blocks are ordered), its cells in the order the edit gave them, as
 *   many as the units left pay for;
 * - a chunk past the tick's two waits for a later tick, so an edit at a 4-chunk corner finishes in
 *   2 ticks; whatever is left carries over.
 */
import {
  DENSITY_CELL_UNITS,
  SWAP_CELL_UNITS,
  TERRAIN_EDIT_CHUNKS_PER_TICK,
  TERRAIN_EDIT_UNITS_PER_TICK,
} from '../../../constants/terrainBudget'
import { chunkKey, chunkOfTile } from '../../world/tileGrid'
import type { QueuedTerrainEdit, TerrainCellEdit } from './terrainEdits'

/** The cells one edit changes this tick. */
export interface AppliedTerrainEdit {
  playerId: string
  source: string
  cells: TerrainCellEdit[]
}

export interface TerrainEditTick {
  applied: AppliedTerrainEdit[]
  /** The edits with cells still to change, in queue order. */
  queue: QueuedTerrainEdit[]
}

/** An edit while the tick is planned: the cells it still has, and the ones taken this tick. */
interface PlannedEdit {
  edit: QueuedTerrainEdit
  left: TerrainCellEdit[]
  taken: TerrainCellEdit[]
}

/** What the tick has left to give. */
interface TickBudget {
  unitsLeft: number
  chunks: Set<string>
}

export function planTerrainEditTick(queue: readonly QueuedTerrainEdit[]): TerrainEditTick {
  const planned = queue.map((edit) => ({ edit, left: [...edit.cells], taken: [] }))
  const budget = { unitsLeft: TERRAIN_EDIT_UNITS_PER_TICK, chunks: new Set<string>() }
  takeTurnsUntilSpent(planned, playersInQueueOrder(queue), budget)
  return { applied: appliedOf(planned), queue: queueLeftOf(planned) }
}

function playersInQueueOrder(queue: readonly QueuedTerrainEdit[]): string[] {
  return [...new Set(queue.map(({ playerId }) => playerId))]
}

/** Rounds of one turn per player, until a whole round takes nothing. */
function takeTurnsUntilSpent(
  planned: readonly PlannedEdit[],
  players: readonly string[],
  budget: TickBudget,
): void {
  let isTaking = true
  while (isTaking) {
    isTaking = false
    for (const playerId of players) {
      const oldest = planned.find(
        (entry) => entry.edit.playerId === playerId && entry.left.length > 0,
      )
      if (oldest !== undefined && takeNextChunk(oldest, budget)) isTaking = true
    }
  }
}

/** The edit's lowest chunk, as far as the budget pays; false when it took nothing. */
function takeNextChunk(entry: PlannedEdit, budget: TickBudget): boolean {
  const chunk = lowestChunkOf(entry.left)
  if (!budget.chunks.has(chunk) && budget.chunks.size === TERRAIN_EDIT_CHUNKS_PER_TICK) return false
  const taken = affordableCellsIn(entry.left, chunk, budget)
  if (taken.length === 0) return false
  budget.chunks.add(chunk)
  entry.taken.push(...taken)
  entry.left = entry.left.filter((cell) => !taken.includes(cell))
  return true
}

/** The chunk's cells in edit order, while the units last; spends their units. */
function affordableCellsIn(
  cells: readonly TerrainCellEdit[],
  chunk: string,
  budget: TickBudget,
): TerrainCellEdit[] {
  const taken: TerrainCellEdit[] = []
  for (const cell of cells) {
    if (chunkOf(cell) !== chunk) continue
    if (unitsOf(cell) > budget.unitsLeft) break
    budget.unitsLeft -= unitsOf(cell)
    taken.push(cell)
  }
  return taken
}

function lowestChunkOf(cells: readonly TerrainCellEdit[]): string {
  return cells.map(chunkOf).sort()[0]
}

function chunkOf(cell: TerrainCellEdit): string {
  return chunkKey(chunkOfTile(cell.tx), chunkOfTile(cell.ty))
}

function unitsOf(cell: TerrainCellEdit): number {
  return cell.kind === 'density' ? DENSITY_CELL_UNITS : SWAP_CELL_UNITS
}

function appliedOf(planned: readonly PlannedEdit[]): AppliedTerrainEdit[] {
  return planned
    .filter(({ taken }) => taken.length > 0)
    .map(({ edit, taken }) => ({ playerId: edit.playerId, source: edit.source, cells: taken }))
}

function queueLeftOf(planned: readonly PlannedEdit[]): QueuedTerrainEdit[] {
  return planned
    .filter(({ left }) => left.length > 0)
    .map(({ edit, left }) => ({ ...edit, cells: left }))
}
