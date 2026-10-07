import { describe, expect, it } from 'vitest'
import { createChunkCache } from './chunkCache'
import { generateChunk } from './generateChunk'
import { planetParamsFor } from './planetParams'

const params = planetParamsFor(83921, 1)

describe('chunk cache', () => {
  it('serves the same cells and density generateChunk makes', () => {
    const cache = createChunkCache(params, 4)
    expect(cache.generatedChunkOf(-2, 3)).toEqual(generateChunk(params, -2, 3))
    expect(cache.generatedCellsOf(-2, 3)).toEqual(generateChunk(params, -2, 3).cells)
  })

  it('serves a held chunk without generating it again, its density made once', () => {
    const cache = createChunkCache(params, 4)
    expect(cache.generatedCellsOf(1, 1)).toBe(cache.generatedCellsOf(1, 1))
    expect(cache.generatedChunkOf(1, 1).density).toBe(cache.generatedChunkOf(1, 1).density)
    expect(cache.generatedChunkOf(1, 1).cells).toBe(cache.generatedCellsOf(1, 1))
  })

  it('counts a chunk generated once its cells and density are held, and asking generates nothing', () => {
    const cache = createChunkCache(params, 4)
    expect(cache.isGenerated(2, 2)).toBe(false)
    expect(cache.size()).toBe(0)
    cache.generatedCellsOf(2, 2)
    expect(cache.isGenerated(2, 2)).toBe(false)
    cache.generatedChunkOf(2, 2)
    expect(cache.isGenerated(2, 2)).toBe(true)
  })

  it('evicts the least recently used chunk past its capacity', () => {
    const cache = createChunkCache(params, 2)
    const first = cache.generatedCellsOf(0, 0)
    cache.generatedCellsOf(1, 0)
    cache.generatedCellsOf(0, 0)
    const second = cache.generatedCellsOf(2, 0)
    expect(cache.size()).toBe(2)
    expect(cache.generatedCellsOf(0, 0)).toBe(first)
    expect(cache.generatedCellsOf(2, 0)).toBe(second)
  })

  it('never evicts a touched chunk', () => {
    const cache = createChunkCache(params, 1)
    cache.markTouched(5, 5)
    const touched = cache.generatedCellsOf(5, 5)
    cache.generatedCellsOf(0, 0)
    cache.generatedCellsOf(1, 0)
    expect(cache.generatedCellsOf(5, 5)).toBe(touched)
    expect(cache.size()).toBe(2)
  })

  it.each([0, -1, 1.5])('refuses the capacity %s', (capacity) => {
    expect(() => createChunkCache(params, capacity)).toThrow(RangeError)
  })
})
