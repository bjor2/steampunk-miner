import { describe, expect, it } from 'vitest'
import { planetParamsFor } from './planetParams'
import { CHUNK_SIZE } from './tileGrid'
import { cachedChunkCount, cellAt, EMPTY_WORLD } from './worldState'

describe('world state', () => {
  it('counts the generated chunks it holds for lookups (#121 memory sample)', () => {
    const params = planetParamsFor(83921, 1)
    cellAt(EMPTY_WORLD, params, { tx: 0, ty: 0 })
    const held = cachedChunkCount()
    cellAt(EMPTY_WORLD, params, { tx: 3 * CHUNK_SIZE, ty: 0 })
    cellAt(EMPTY_WORLD, params, { tx: 3 * CHUNK_SIZE, ty: 1 })
    expect(held).toBeGreaterThanOrEqual(1)
    expect(cachedChunkCount()).toBe(held + 1)
  })
})
