import { describe, expect, it } from 'vitest'
import { clearDisc } from '../world/groundEdit'
import { planetParamsFor } from '../world/planetParams'
import { CHUNK_SIZE } from '../world/tileGrid'
import { EMPTY_WORLD, type WorldState } from '../world/worldState'
import { chunkMeshJobOf, runChunkMeshJob } from './chunkMeshJob'
import { buildChunkMeshParts } from './chunkMeshParts'

// The chunk worker's job (TD scope c2 on #316, ticket 337): it carries the planet and the deltas
// its halo reads, crosses postMessage as a structured clone, and builds what the main thread would.

const params = planetParamsFor(83921, 1)
/** Chunk (0, 8) of planet 1, under the surface. */
const CHUNK = { cx: 0, cy: 8 }
const rowMm = CHUNK.cy * CHUNK_SIZE * 1000

function cutAt(world: WorldState, xMm: number, yMm: number): WorldState {
  const disc = { xMm, yMm, radiusMm: 950, floorRadiusMm: null }
  return clearDisc(world, params, disc, 255).world
}

describe('chunk mesh job (ticket 337)', () => {
  it('builds across a structured clone the same parts the main thread builds', () => {
    const inChunk = cutAt(EMPTY_WORLD, 16_000, rowMm + 16_000)
    const world = cutAt(inChunk, CHUNK_SIZE * 1000 + 300, rowMm + 16_000)
    const job = structuredClone(chunkMeshJobOf(7, params, world, CHUNK.cx, CHUNK.cy))
    const result = structuredClone(runChunkMeshJob(job))
    expect(result.id).toBe(7)
    expect(result.parts).toEqual(buildChunkMeshParts(params, world, CHUNK.cx, CHUNK.cy))
  })

  it('carries only the deltas of the chunks its halo reads', () => {
    const left = cutAt(EMPTY_WORLD, -16_000, rowMm + 16_000)
    const world = cutAt(left, 16_000, rowMm + 16_000)
    const job = chunkMeshJobOf(1, params, world, CHUNK.cx, CHUNK.cy)
    expect(Object.keys(job.deltas)).toEqual([`${CHUNK.cx},${CHUNK.cy}`])
  })
})
