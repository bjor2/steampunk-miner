/**
 * A chunk's changes from its generated state (decisions #4 Storage, #36 Storage):
 *
 * - `density`: the current density XOR the generated one, run-length encoded as
 *   `[count, value, count, value, ...]`. A drilled chunk is mostly long runs of 0, so a tunnel
 *   through a chunk costs a few hundred numbers.
 * - `yieldedRows`: one bit per material cell that has credited its ore (#36 Yield), 32 uint32
 *   words, word `ly` holding bit `lx` of chunk row `ly`. A yielded cell counts as open ground for
 *   every cell rule (enemies, the bot, the drill), as a removed tile did under generator 1.
 * - `casing`: the casing layer (#41), one grade per density sample (0 = no casing, 1 to 15, or
 *   `CASING_BREACHED`), run-length encoded like `density`. Generation lays no casing, so the runs
 *   are the layer itself.
 * - `overrides`: sparse `[index, cell]` material overrides sorted by index (placed supports later).
 * - `version`: counts the changes, so a renderer or collider can tell a chunk moved on (#36
 *   `GroundChanged`).
 *
 * The world is `seed + params + deltas`, so only touched chunks are ever saved. Plain JSON shapes,
 * so a delta lives in authority state and its canonical digest. Immutable.
 */
import { CHUNK_SAMPLES } from './sampleGrid'
import { CHUNK_SIZE } from './tileGrid'
import { AIR_CELL } from './worldCell'

/** The highest grade a casing sample holds (#41: 1 to 15); a higher player grade lines at 15. */
export const MAX_SAMPLE_CASING_GRADE = 15

/**
 * Lining a tunnel wrecker gnawed (#111 Technical Director, a reserved value of the same layer):
 * still lined, but holding at grade 0, so it is weak in every band. 16 to 254 stay invalid.
 */
export const CASING_BREACHED = 255

/** The grade a casing sample holds against collapse and the drill: 0 for breached lining. */
export function effectiveCasingGrade(casing: number): number {
  return casing === CASING_BREACHED ? 0 : casing
}

/** Lined, breached or not: never-lined rock is 0. */
export function isLined(casing: number): boolean {
  return casing > 0
}

/** Lining at a grade of 1 to 15, the only casing a gnaw breaches. */
export function isIntactLining(casing: number): boolean {
  return isLined(casing) && casing !== CASING_BREACHED
}

/** A value the casing layer may hold: none, a grade, or breached. */
export function isCasingValue(casing: number): boolean {
  return casing <= MAX_SAMPLE_CASING_GRADE || casing === CASING_BREACHED
}

export interface ChunkDelta {
  density: readonly number[]
  casing: readonly number[]
  yieldedRows: readonly number[]
  overrides: readonly (readonly [index: number, cell: number])[]
  version: number
}

export const EMPTY_CHUNK_DELTA: ChunkDelta = {
  density: [],
  casing: [],
  yieldedRows: new Array<number>(CHUNK_SIZE).fill(0),
  overrides: [],
  version: 0,
}

export function isCellYielded(delta: ChunkDelta, index: number): boolean {
  return (delta.yieldedRows[rowOf(index)] & bitOf(index)) !== 0
}

/** A yielded cell stays yielded: it credits its ore once, whatever is filled back later. */
export function withCellsYielded(delta: ChunkDelta, indices: readonly number[]): ChunkDelta {
  let rows = delta.yieldedRows
  for (const index of indices) rows = withRowBit(rows, index)
  return { ...delta, yieldedRows: rows, version: delta.version + 1 }
}

/** An override replaces the material of a cell outright. */
export function withCellOverride(delta: ChunkDelta, index: number, cell: number): ChunkDelta {
  return {
    ...delta,
    overrides: [...delta.overrides.filter(([at]) => at !== index), [index, cell] as const].sort(
      ([a], [b]) => a - b,
    ),
    version: delta.version + 1,
  }
}

/** The density as it stands now becomes the delta's, encoded against the generated density. */
export function withDensity(
  delta: ChunkDelta,
  current: Uint8Array,
  generated: Uint8Array,
): ChunkDelta {
  return { ...delta, density: encodeDensityChange(current, generated), version: delta.version + 1 }
}

/** The casing layer as it stands now becomes the delta's. */
export function withCasing(delta: ChunkDelta, casing: Uint8Array): ChunkDelta {
  return { ...delta, casing: encodeDensityChange(casing, NO_CASING), version: delta.version + 1 }
}

export function isChunkTouched(delta: ChunkDelta): boolean {
  return (
    delta.density.length > 0 ||
    delta.casing.length > 0 ||
    delta.overrides.length > 0 ||
    delta.yieldedRows.some((row) => row !== 0)
  )
}

/** The material cells as they stand now: generated, overrides applied, yielded cells open. */
export function applyChunkDelta(generated: Uint32Array, delta: ChunkDelta): Uint32Array {
  const cells = materialCellsOf(generated, delta)
  for (let index = 0; index < cells.length; index++) {
    if (isCellYielded(delta, index)) cells[index] = AIR_CELL
  }
  return cells
}

/** The material cells with overrides but without the yield mask: what the ground is made of. */
export function materialCellsOf(generated: Uint32Array, delta: ChunkDelta): Uint32Array {
  const cells = generated.slice()
  for (const [index, cell] of delta.overrides) cells[index] = cell
  return cells
}

/** The current density: the generated density XOR the decoded runs. A fresh array. */
export function decodeDensity(generated: Uint8Array, delta: ChunkDelta): Uint8Array {
  return xorRuns(generated, delta.density)
}

/** The casing layer, one grade per sample. A fresh array. */
export function decodeCasing(delta: ChunkDelta): Uint8Array {
  return xorRuns(NO_CASING, delta.casing)
}

/** A chunk with no casing anywhere, what generation lays (#41). Shared: only ever read. */
export const NO_CASING: Uint8Array = new Uint8Array(CHUNK_SAMPLES)

function xorRuns(base: Uint8Array, runs: readonly number[]): Uint8Array {
  const layer = base.slice()
  let at = 0
  for (let run = 0; run < runs.length; run += 2) {
    const [count, value] = [runs[run], runs[run + 1]]
    if (value !== 0) xorRange(layer, at, count, value)
    at += count
  }
  return layer
}

/** `current XOR generated` as runs; an unchanged density is no runs at all. */
export function encodeDensityChange(current: Uint8Array, generated: Uint8Array): number[] {
  const runs: number[] = []
  let at = 0
  while (at < current.length) {
    const value = current[at] ^ generated[at]
    const end = runEndOf(current, generated, at, value)
    runs.push(end - at, value)
    at = end
  }
  return runs.length === 2 && runs[1] === 0 ? [] : runs
}

function runEndOf(current: Uint8Array, generated: Uint8Array, start: number, value: number) {
  let end = start + 1
  while (end < current.length && (current[end] ^ generated[end]) === value) end++
  return end
}

function xorRange(density: Uint8Array, start: number, count: number, value: number): void {
  for (let at = start; at < start + count; at++) density[at] ^= value
}

function rowOf(index: number): number {
  return Math.floor(index / CHUNK_SIZE)
}

function bitOf(index: number): number {
  return (1 << (index % CHUNK_SIZE)) >>> 0
}

function withRowBit(rows: readonly number[], index: number): number[] {
  const next = rows.slice()
  next[rowOf(index)] = (rows[rowOf(index)] | bitOf(index)) >>> 0
  return next
}
