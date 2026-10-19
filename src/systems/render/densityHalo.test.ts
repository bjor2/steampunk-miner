import { describe, expect, it } from 'vitest'
import { clearDisc } from '../world/groundEdit'
import { planetParamsFor } from '../world/planetParams'
import { CHUNK_SIZE } from '../world/tileGrid'
import { currentDensityOfChunk, EMPTY_WORLD, type WorldState } from '../world/worldState'
import {
  chunkViewVersionOf,
  isHaloEdgeCurrentSince,
  isOwnChunkSame,
  isSameChunkView,
  writeHaloChangesSince,
} from './chunkViewVersion'
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

  it('reads only the neighbours whose delta changed since the halo was built (ticket 337)', () => {
    const world = cutAt(neighbourLeft + 16_000, rowMm + 16_000)
    const read: string[] = []
    const densityOf = (cx: number, cy: number) => {
      read.push(`${cx},${cy}`)
      return densityIn(world)(cx, cy)
    }
    const built = chunkViewVersionOf(EMPTY_WORLD, CHUNK.cx, CHUNK.cy)
    const now = chunkViewVersionOf(world, CHUNK.cx, CHUNK.cy)
    expect(isHaloEdgeCurrentSince(halo, densityOf, CHUNK.cx, CHUNK.cy, built, now)).toBe(true)
    expect(read).toEqual([`${CHUNK.cx + 1},${CHUNK.cy}`])
  })

  it('finds the edge stale through the neighbour that changed (ticket 337)', () => {
    const world = cutAt(neighbourLeft + 300, rowMm + 16_000)
    const built = chunkViewVersionOf(EMPTY_WORLD, CHUNK.cx, CHUNK.cy)
    const now = chunkViewVersionOf(world, CHUNK.cx, CHUNK.cy)
    const isCurrent = isHaloEdgeCurrentSince(halo, densityIn(world), CHUNK.cx, CHUNK.cy, built, now)
    expect(isCurrent).toBe(false)
  })
})

describe('halo brought up to an edit (ticket 570)', () => {
  const built = chunkViewVersionOf(EMPTY_WORLD, CHUNK.cx, CHUNK.cy)

  it("writes the chunk's own cut and its neighbour's edge into the halo it holds", () => {
    const world = cutAt(CHUNK_SIZE * 1000 - 300, CHUNK.cy * CHUNK_SIZE * 1000 + 16_000)
    const halo = chunkDensityHaloOf(densityIn(EMPTY_WORLD), CHUNK.cx, CHUNK.cy)
    const now = chunkViewVersionOf(world, CHUNK.cx, CHUNK.cy)
    writeHaloChangesSince(halo, densityIn(world), CHUNK, built, now)
    expect(halo).toEqual(chunkDensityHaloOf(densityIn(world), CHUNK.cx, CHUNK.cy))
  })

  it('reads only the chunks whose delta changed since the view it holds', () => {
    const world = cutAt(16_000, CHUNK.cy * CHUNK_SIZE * 1000 + 16_000)
    const halo = chunkDensityHaloOf(densityIn(EMPTY_WORLD), CHUNK.cx, CHUNK.cy)
    const read: string[] = []
    const densityOf = (cx: number, cy: number) => {
      read.push(`${cx},${cy}`)
      return densityIn(world)(cx, cy)
    }
    const now = chunkViewVersionOf(world, CHUNK.cx, CHUNK.cy)
    writeHaloChangesSince(halo, densityOf, CHUNK, built, now)
    expect(read).toEqual([`${CHUNK.cx},${CHUNK.cy}`])
  })
})
