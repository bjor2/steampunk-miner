import { describe, expect, it } from 'vitest'
import { withRegistrations } from '../../registries/registrar'
import type { SliceDefinition } from '../../registries/sliceDefinition'
import { PARAMS, surfaceOreTiles } from '../authority/scriptedSession'
import { chunkOfTile } from '../world/tileGrid'
import { currentDensityOfChunk, EMPTY_WORLD, materialCellsOfChunk } from '../world/worldState'
import { buildChunkTileBatch, SILHOUETTE_CODE, type ChunkTileBatch } from './chunkTileBatch'
import { chunkDensityHaloOf } from './densityHalo'
import type { OreLook } from './oreLook'

// The chunk mesh asks the ore-look registry how an ore cell looks (feature-slices.md 3.9); a fake
// provider registers through withRegistrations, so no real slice is imported.

const [ORE_TILE] = surfaceOreTiles(1)
const CX = chunkOfTile(ORE_TILE.tx)
const CY = chunkOfTile(ORE_TILE.ty)

const PROBE_LOOK: OreLook = { silhouette: 'shards', colour: [0.25, 0.5, 1], glow: 0, sparkles: 3 }

const probeLookSlice: SliceDefinition = {
  id: 'look-probe',
  register: (r) => r.oreLook({ id: 'look-probe.flat', oreLookOfCell: () => PROBE_LOOK }),
}

function batchWith(slices: readonly SliceDefinition[]): ChunkTileBatch {
  return withRegistrations(slices, () => {
    const cells = materialCellsOfChunk(EMPTY_WORLD, PARAMS, CX, CY)
    const halo = chunkDensityHaloOf(
      (x, y) => currentDensityOfChunk(EMPTY_WORLD, PARAMS, x, y),
      CX,
      CY,
    )
    return buildChunkTileBatch(PARAMS, CX, CY, cells, halo)
  })
}

/** Each drawn ore tile's colour, glow, silhouette and sparkles. */
function oreLooksOf(batch: ChunkTileBatch): number[][] {
  const looks: number[][] = []
  for (let at = 0; at < batch.count; at++) {
    const silhouette = batch.styles[at * 4 + 2]
    if (silhouette === SILHOUETTE_CODE.none) continue
    looks.push([
      ...batch.oreColours.subarray(at * 4, at * 4 + 4),
      silhouette,
      batch.styles[at * 4 + 3],
    ])
  }
  return looks
}

describe('ore look at the chunk mesh', () => {
  it("draws every ore tile in the registered provider's look", () => {
    const looks = oreLooksOf(batchWith([probeLookSlice]))
    expect(looks.length).toBeGreaterThan(0)
    expect(new Set(looks.map((look) => look.join()))).toEqual(
      new Set([[0.25, 0.5, 1, 0, SILHOUETTE_CODE.shards, 3].join()]),
    )
  })
})
