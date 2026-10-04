/**
 * The generated-chunk cache (decision #4): chunks are generated on demand and kept in a
 * least-recently-used cache; touched chunks (those with a delta) are never evicted, so the cells
 * under a dug tunnel stay at hand. Generation is pure, so an evicted chunk regenerates identically.
 *
 * The cache owns its arrays: callers read them and never write into them (deltas apply to a copy,
 * see `applyChunkDelta`).
 */
import { generateChunk } from './generateChunk'
import type { PlanetParams } from './planetParams'
import { chunkKey } from './tileGrid'

export interface ChunkCache {
  /** The generated cells of a chunk, from the cache or freshly generated. */
  generatedCellsOf(cx: number, cy: number): Uint32Array
  /** Keeps the chunk in the cache for good once it has a delta. */
  markTouched(cx: number, cy: number): void
  /** Chunks currently held, touched ones included. */
  size(): number
}

/** `capacity` bounds the untouched chunks held; touched chunks are kept on top of it. */
export function createChunkCache(params: PlanetParams, capacity: number): ChunkCache {
  assertValidCapacity(capacity)
  const held = new Map<string, Uint32Array>()
  const touched = new Set<string>()

  const generatedCellsOf = (cx: number, cy: number): Uint32Array => {
    const key = chunkKey(cx, cy)
    const cells = held.get(key) ?? generateChunk(params, cx, cy)
    markMostRecent(held, key, cells)
    evictLeastRecentUntouched(held, touched, capacity)
    return cells
  }

  return {
    generatedCellsOf,
    markTouched: (cx, cy) => {
      touched.add(chunkKey(cx, cy))
      generatedCellsOf(cx, cy)
    },
    size: () => held.size,
  }
}

/** A Map iterates in insertion order, so re-inserting a key makes it the most recent. */
function markMostRecent(held: Map<string, Uint32Array>, key: string, cells: Uint32Array): void {
  held.delete(key)
  held.set(key, cells)
}

function evictLeastRecentUntouched(
  held: Map<string, Uint32Array>,
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
