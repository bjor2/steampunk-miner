import { describe, expect, it } from 'vitest'
import { EMPTY_CHUNK_DELTA, withCellsYielded, type ChunkDelta } from './chunkDelta'
import { coreDepthOf, deepestOpenedDepthOf } from './openedDepth'
import { depthTilesAt } from './planetGeometry'
import { freshPlanetParamsFor } from './planetParams'
import {
  cellIndexOfTile,
  chunkKey,
  chunkOfTile,
  surfaceRowOfColumn,
  type TilePoint,
} from './tileGrid'

const PARAMS = freshPlanetParamsFor(1, 1)
const SURFACE_ROW = surfaceRowOfColumn(0, PARAMS.radiusTiles)

/** The deltas of a world where exactly these cells have yielded. */
function chunksYielding(tiles: readonly TilePoint[]): Record<string, ChunkDelta> {
  const chunks: Record<string, ChunkDelta> = {}
  for (const tile of tiles) {
    const key = chunkKey(chunkOfTile(tile.tx), chunkOfTile(tile.ty))
    const index = cellIndexOfTile(tile.tx, tile.ty)
    chunks[key] = withCellsYielded(chunks[key] ?? EMPTY_CHUNK_DELTA, [index])
  }
  return chunks
}

describe('opened depth (ticket 703)', () => {
  it('is 0 before any cell has yielded', () => {
    expect(deepestOpenedDepthOf(PARAMS, {})).toBe(0)
  })

  it('reads the deepest yielded cell in the HUD depth measure', () => {
    const shaft = [3, 40, 75].map((depth) => ({ tx: 5, ty: SURFACE_ROW - depth }))
    const side = { tx: -37, ty: surfaceRowOfColumn(-37, PARAMS.radiusTiles) - 12 }
    expect(deepestOpenedDepthOf(PARAMS, chunksYielding([...shaft, side]))).toBe(
      depthTilesAt(PARAMS, 5, SURFACE_ROW - 75),
    )
  })

  it('finds a cell in any bit of its row word, the sign bit included', () => {
    const lastColumnOfChunk = { tx: 31, ty: SURFACE_ROW - 64 }
    expect(deepestOpenedDepthOf(PARAMS, chunksYielding([lastColumnOfChunk]))).toBe(
      depthTilesAt(PARAMS, 31, SURFACE_ROW - 64),
    )
  })

  it('spans the gauge from the surface to the top of the core on the dock column', () => {
    const coreTop = surfaceRowOfColumn(0, PARAMS.coreRadiusTiles)
    expect(coreDepthOf(PARAMS)).toBe(SURFACE_ROW - coreTop)
    expect(coreDepthOf(PARAMS)).toBeGreaterThan(0)
  })
})
