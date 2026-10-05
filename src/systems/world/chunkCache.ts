/**
 * The generated-chunk cache (decision #4): chunks are generated on demand and kept in a
 * least-recently-used cache; touched chunks (those with a delta) are never evicted, so the cells
 * and density under a dug tunnel stay at hand. Generation is pure, so an evicted chunk
 * regenerates identically. A chunk's density (#36) is made the first time something reads it:
 * rules that only ask what a tile is (enemy spawns, the bot) never pay for it.
 *
 * The cache owns its arrays: callers read them and never write into them (deltas apply to a copy,
 * see `chunkDelta.ts`).
 */
import { generateChunkCells, type GeneratedChunk } from './generateChunk'
import { generateDensity } from './generateDensity'
import type { PlanetParams } from './planetParams'
import { chunkKey } from './tileGrid'

export interface ChunkCache {
  /** The generated cells of a chunk, from the cache or freshly generated. */
  generatedCellsOf(cx: number, cy: number): Uint32Array
  /** The generated cells and density of a chunk, from the cache or freshly generated. */
  generatedChunkOf(cx: number, cy: number): GeneratedChunk
  /** Keeps the chunk in the cache for good once it has a delta. */
  markTouched(cx: number, cy: number): void
  /** Chunks currently held, touched ones included. */
  size(): number
}

interface HeldChunk {
  cells: Uint32Array
  density: Uint8Array | null
}

/** `capacity` bounds the untouched chunks held; touched chunks are kept on top of it. */
export function createChunkCache(params: PlanetParams, capacity: number): ChunkCache {
  assertValidCapacity(capacity)
  const held = new Map<string, HeldChunk>()
  const touched = new Set<string>()

  const heldChunkOf = (cx: number, cy: number): HeldChunk => {
    const key = chunkKey(cx, cy)
    const chunk = held.get(key) ?? { cells: generateChunkCells(params, cx, cy), density: null }
    markMostRecent(held, key, chunk)
    evictLeastRecentUntouched(held, touched, capacity)
    return chunk
  }

  const generatedChunkOf = (cx: number, cy: number): GeneratedChunk => {
    const chunk = heldChunkOf(cx, cy)
    chunk.density ??= generateDensity(params, cx, cy, chunk.cells)
    return { cells: chunk.cells, density: chunk.density }
  }

  return {
    generatedCellsOf: (cx, cy) => heldChunkOf(cx, cy).cells,
    generatedChunkOf,
    markTouched: (cx, cy) => {
      touched.add(chunkKey(cx, cy))
      heldChunkOf(cx, cy)
    },
    size: () => held.size,
  }
}

/** A Map iterates in insertion order, so re-inserting a key makes it the most recent. */
function markMostRecent(held: Map<string, HeldChunk>, key: string, chunk: HeldChunk): void {
  held.delete(key)
  held.set(key, chunk)
}

function evictLeastRecentUntouched(
  held: Map<string, HeldChunk>,
  touched: ReadonlySet<string>,
  capacity: number,
): void {
  for (const key of held.keys()) {
    if (held.size - touched.size <= capacity) return
    if (!touched.has(key)) held.delete(key)
  }
}

function assertValidCapacity(capacity: number): void {
  if (!Number.isSafeInteger(capacity) || capacity < 1) {
    throw new RangeError(`chunk cache capacity must be a whole number >= 1, got ${capacity}`)
  }
}
