/**
 * A chunk mesh built off the main thread (TD scope c2 on #316, ticket 337): the job carries the
 * planet and the deltas of the four chunks the density halo reads, nothing else of the world, and
 * the worker generates those chunks itself (`generateChunk` behind its own cache), applies the
 * deltas and builds the tile batch. Every field is plain data, so a job crosses `postMessage` as a
 * structured clone, and the result's typed arrays are handed back without a copy. Only the
 * renderer asks: the authority keeps its own single-threaded generation.
 */
import type { ChunkDelta } from '../world/chunkDelta'
import type { PlanetParams } from '../world/planetParams'
import { chunkKey } from '../world/tileGrid'
import type { WorldState } from '../world/worldState'
import { buildChunkMeshParts, type ChunkMeshParts } from './chunkMeshParts'
import { haloChunksOf } from './densityHalo'

export interface ChunkMeshJob {
  /** Numbers the job among every job the renderer posted, so its result is told from older ones. */
  id: number
  params: PlanetParams
  cx: number
  cy: number
  /** The deltas of the chunks the halo reads, keyed like `WorldState.chunks`; untouched ones absent. */
  deltas: Record<string, ChunkDelta>
}

export interface ChunkMeshResult {
  id: number
  cx: number
  cy: number
  parts: ChunkMeshParts
}

/** What the worker posts back: once that its slices are loaded, then one result per job. */
export type ChunkWorkerReply = { kind: 'ready' } | ({ kind: 'built' } & ChunkMeshResult)

export function chunkMeshJobOf(
  id: number,
  params: PlanetParams,
  world: WorldState,
  cx: number,
  cy: number,
): ChunkMeshJob {
  return { id, params, cx, cy, deltas: haloDeltasOf(world, cx, cy) }
}

/** What the worker does with a job: the same parts the main thread would build from its world. */
export function runChunkMeshJob(job: ChunkMeshJob): ChunkMeshResult {
  const world: WorldState = { chunks: job.deltas }
  const parts = buildChunkMeshParts(job.params, world, job.cx, job.cy)
  return { id: job.id, cx: job.cx, cy: job.cy, parts }
}

function haloDeltasOf(world: WorldState, cx: number, cy: number): Record<string, ChunkDelta> {
  const deltas: Record<string, ChunkDelta> = {}
  for (const chunk of haloChunksOf(cx, cy)) {
    const key = chunkKey(chunk.cx, chunk.cy)
    const delta = world.chunks[key]
    if (delta !== undefined) deltas[key] = delta
  }
  return deltas
}
