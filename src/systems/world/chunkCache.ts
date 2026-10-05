/**
 * The generated-chunk cache (decision #4): chunks are generated on demand and kept in a
 * least-recently-used cache; touched chunks (those with a delta) are never evicted, so the cells
 * and density under a dug tunnel stay at hand. Generation is pure, so an evicted chunk
 * regenerates identically.
 *
 * The cache owns its arrays: callers read them and never write into them (deltas apply to a copy,
 * see `applyChunkDelta`).
 */
import { generateChunk, type GeneratedChunk } from './generateChunk'
import type { PlanetParams } from './planetParams'
import { chunkKey } from './tileGrid'

export interface ChunkCache {
  /** The generated cells and density of a chunk, from the cache or freshly generated. */
  generatedChunkOf(cx: number, cy: number): GeneratedChunk
  /** Keeps the chunk in the cache for good once it has a delta. */
  markTouched(cx: number, cy: number): void
  /** Chunks currently held, touched ones included. */
  size(): number
}

/** `capacity` bounds the untouched chunks held; touched chunks are kept on top of it. */
export function createChunkCache(params: PlanetParams, capacity: number): ChunkCache {
  assertValidCapacity(capacity)
  const held = new Map<string, GeneratedChunk>()
  const touched = new Set<string>()

  const generatedChunkOf = (cx: number, cy: number): GeneratedChunk => {
    const key = chunkKey(cx, cy)
    const chunk = held.get(key) ?? generateChunk(params, cx, cy)
    markMostRecent(held, key, chunk)
    evictLeastRecentUntouched(held, touched, capacity)
    return chunk
  }

  return {
    generatedChunkOf,
    markTouched: (cx, cy) => {
      touched.add(chunkKey(cx, cy))
      generatedChunkOf(cx, cy)
    },
    size: () => held.size,
  }
}

/** A Map iterates in insertion order, so re-inserting a key makes it the most recent. */
function markMostRecent(
  held: Map<string, GeneratedChunk>,
  key: string,
  chunk: GeneratedChunk,
): void {
  held.delete(key)
  held.set(key, chunk)
}

function evictLeastRecentUntouched(
  held: Map<string, GeneratedChunk>,
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
