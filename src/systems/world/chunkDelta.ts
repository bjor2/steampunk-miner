/**
 * A chunk's changes from its generated state (decision #4, Storage): a 128-byte removed bitset
 * plus sparse `[index, cell]` overrides. The world is `seed + params + deltas`, so only touched
 * chunks are ever saved. Overrides exist so later features (placed supports, regrowing ground)
 * never need a format change.
 *
 * Plain JSON shapes so a delta can live in authority state and its canonical digest: the bitset
 * is 32 uint32 words, word `ly` holding bit `lx` of chunk row `ly`; overrides are sorted by index.
 * Immutable: every change returns a new delta.
 */
import { CHUNK_SIZE } from './tileGrid'
import { AIR_CELL } from './worldCell'

export interface ChunkDelta {
  removedRows: readonly number[]
  overrides: readonly (readonly [index: number, cell: number])[]
}

export const EMPTY_CHUNK_DELTA: ChunkDelta = {
  removedRows: new Array<number>(CHUNK_SIZE).fill(0),
  overrides: [],
}

export function isCellRemoved(delta: ChunkDelta, index: number): boolean {
  return (delta.removedRows[rowOf(index)] & bitOf(index)) !== 0
}

/** A removed tile becomes air; it drops any override at the same cell. */
export function withCellRemoved(delta: ChunkDelta, index: number): ChunkDelta {
  return {
    removedRows: withRowBit(delta.removedRows, index, true),
    overrides: delta.overrides.filter(([at]) => at !== index),
  }
}

/** An override replaces the cell outright and clears its removed bit. */
export function withCellOverride(delta: ChunkDelta, index: number, cell: number): ChunkDelta {
  return {
    removedRows: withRowBit(delta.removedRows, index, false),
    overrides: [...delta.overrides.filter(([at]) => at !== index), [index, cell] as const].sort(
      ([a], [b]) => a - b,
    ),
  }
}

export function isChunkTouched(delta: ChunkDelta): boolean {
  return delta.overrides.length > 0 || delta.removedRows.some((row) => row !== 0)
}

/** The chunk as it stands now: a copy of the generated cells with the delta applied. */
export function applyChunkDelta(generated: Uint32Array, delta: ChunkDelta): Uint32Array {
  const cells = generated.slice()
  for (let index = 0; index < cells.length; index++) {
    if (isCellRemoved(delta, index)) cells[index] = AIR_CELL
  }
  for (const [index, cell] of delta.overrides) cells[index] = cell
  return cells
}

function rowOf(index: number): number {
  return Math.floor(index / CHUNK_SIZE)
}

function bitOf(index: number): number {
  return (1 << (index % CHUNK_SIZE)) >>> 0
}

function withRowBit(rows: readonly number[], index: number, isSet: boolean): number[] {
  const next = rows.slice()
  const row = rowOf(index)
  next[row] = (isSet ? rows[row] | bitOf(index) : rows[row] & ~bitOf(index)) >>> 0
  return next
}
