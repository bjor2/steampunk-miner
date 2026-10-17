/**
 * What a chunk's mesh is made of before any of it reaches the GPU (#4 Rendering, #36): its tile
 * batch and the density halo its texture shows, built from the world as it stands. A pure function
 * of the planet, the deltas of the chunks the halo reads and the chunk's coordinates, so the
 * renderer builds it on the main thread or hands it to the chunk worker (TD scope c2 on #316,
 * ticket 337) and gets the same parts either way. Split from `scene/chunkMeshPool.ts`.
 */
import type { PlanetParams } from '../world/planetParams'
import { NO_CASING } from '../world/chunkDelta'
import {
  currentCasingOfChunk,
  currentDensityOfChunk,
  materialCellsOfChunk,
  type WorldState,
} from '../world/worldState'
import { buildChunkTileBatch, type ChunkTileBatch } from './chunkTileBatch'
import { chunkDensityHaloOf } from './densityHalo'
import { liningCellsOf, UNLINED_CHUNK, type ChunkLining } from './liningCells'

export interface ChunkMeshParts {
  batch: ChunkTileBatch
  /** The density halo the chunk's texture shows, kept to check its neighbours' edges. */
  halo: Uint8Array<ArrayBuffer>
}

export function buildChunkMeshParts(
  params: PlanetParams,
  world: WorldState,
  cx: number,
  cy: number,
): ChunkMeshParts {
  const halo = chunkDensityHaloOf((x, y) => currentDensityOfChunk(world, params, x, y), cx, cy)
  const batch = buildChunkTileBatch(
    params,
    cx,
    cy,
    materialCellsOfChunk(world, params, cx, cy),
    halo,
    liningCellsOfChunk(world, cx, cy),
  )
  return { batch, halo }
}

/** The buffers the parts own, which a worker hands over rather than copies. */
export function buffersOfMeshParts({ batch, halo }: ChunkMeshParts): ArrayBufferLike[] {
  return [
    batch.blockStarts.buffer,
    batch.tiles.buffer,
    batch.baseColours.buffer,
    batch.oreColours.buffer,
    batch.styles.buffer,
    batch.gates.buffer,
    batch.kinds.buffer,
    halo.buffer,
  ]
}

/** The cells to draw as lining (#113, ticket 315); none, without a copy, for an unlined chunk. */
function liningCellsOfChunk(world: WorldState, cx: number, cy: number): ChunkLining {
  const casing = currentCasingOfChunk(world, cx, cy)
  return casing === NO_CASING ? UNLINED_CHUNK : liningCellsOf(casing)
}
