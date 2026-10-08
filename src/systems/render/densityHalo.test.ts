import { describe, expect, it } from 'vitest'
import { clearDisc } from '../world/groundEdit'
import { planetParamsFor } from '../world/planetParams'
import { CHUNK_SIZE } from '../world/tileGrid'
import { currentDensityOfChunk, EMPTY_WORLD, type WorldState } from '../world/worldState'
import { chunkViewVersionOf, isOwnChunkSame, isSameChunkView } from './chunkViewVersion'
import { chunkDensityHaloOf, isHaloEdgeCurrent } from './densityHalo'

// Edge-aware chunk views (TD scope on #316, ticket 330): a chunk's mesh reads its right, upper and
// upper-right neighbours only through its halo's edge, so a cut inside a neighbour leaves it as it is.

const params = planetParamsFor(83921, 1)
/** Chunk (0, 8) of planet 1, under the surface; its right neighbour is (1, 8). */
const CHUNK = { cx: 0, cy: 8 }
const densityIn = (world: WorldState) => (cx: number, cy: number) =>
  currentDensityOfChunk(world, params, cx, cy)

function cutAt(xMm: number, yMm: number): WorldState {
  return clearDisc(EMPTY_WORLD, params, { xMm, yMm, radiusMm: 950, floorRadiusMm: null }, 255).world
}

describe('edge-aware chunk view (ticket 330)', () => {
  const halo = chunkDensityHaloOf(densityIn(EMPTY_WORLD), CHUNK.cx, CHUNK.cy)
  const neighbourLeft = CHUNK_SIZE * 1000
  const rowMm = CHUNK.cy * CHUNK_SIZE * 1000

  it('keeps a mesh current when its neighbour is cut away from the halo edge', () => {
    const world = cutAt(neighbourLeft + 16_000, rowMm + 16_000)
    const built = chunkViewVersionOf(EMPTY_WORLD, CHUNK.cx, CHUNK.cy)
    const now = chunkViewVersionOf(world, CHUNK.cx, CHUNK.cy)
    expect(isSameChunkView(built, now)).toBe(false)
    expect(isOwnChunkSame(built, now)).toBe(true)
    expect(isHaloEdgeCurrent(halo, densityIn(world), CHUNK.cx, CHUNK.cy)).toBe(true)
  })

  it("makes it stale when the cut reaches the neighbour's first column", () => {
    const world = cutAt(neighbourLeft + 300, rowMm + 16_000)
    expect(isHaloEdgeCurrent(halo, densityIn(world), CHUNK.cx, CHUNK.cy)).toBe(false)
  })

  it('makes it stale when the cut reaches the first row of the chunk above', () => {
    const world = cutAt(16_000, rowMm + CHUNK_SIZE * 1000 + 300)
    expect(isHaloEdgeCurrent(halo, densityIn(world), CHUNK.cx, CHUNK.cy)).toBe(false)
  })
})
