/**
 * Desync repair, per chunk (decision #36 Determinism, after #4): each chunk has a digest over what
 * the world holds there now, its cells (yielded cells open, overrides applied), its density and
 * its casing layer (#41). When a guest's digest differs from the host's, the host resends that
 * chunk's delta (the density and casing runs, the yield bits and the overrides) and the guest adopts it whole. Pure, so the same rules
 * serve a future network seam and the specs.
 */
import type { ChunkDelta } from './chunkDelta'
import { chunkDigest } from './chunkDigest'
import type { PlanetParams } from './planetParams'
import {
  currentCasingOfChunk,
  currentCellsOfChunk,
  currentDensityOfChunk,
  deltaOfChunk,
  withChunkDelta,
  type WorldState,
} from './worldState'

export interface ChunkPoint {
  cx: number
  cy: number
}

/** What the host sends for one chunk: its whole delta. */
export interface ChunkRepair extends ChunkPoint {
  delta: ChunkDelta
}

export function chunkStateDigest(
  world: WorldState,
  params: PlanetParams,
  { cx, cy }: ChunkPoint,
): string {
  return chunkDigest({
    cells: currentCellsOfChunk(world, params, cx, cy),
    density: currentDensityOfChunk(world, params, cx, cy),
    casing: currentCasingOfChunk(world, cx, cy),
  })
}

/** The chunks among `chunks` whose digests differ between host and guest. */
export function mismatchedChunks(
  host: WorldState,
  guest: WorldState,
  params: PlanetParams,
  chunks: readonly ChunkPoint[],
): ChunkPoint[] {
  return chunks.filter(
    (chunk) => chunkStateDigest(host, params, chunk) !== chunkStateDigest(guest, params, chunk),
  )
}

/** The chunks either side has touched: the only ones that can differ from the seed. */
export function touchedChunksOf(...worlds: readonly WorldState[]): ChunkPoint[] {
  const keys = new Set(worlds.flatMap((world) => Object.keys(world.chunks)))
  return [...keys].map((key) => {
    const [cx, cy] = key.split(',').map((part) => Number.parseInt(part, 10))
    return { cx, cy }
  })
}

export function chunkRepairOf(host: WorldState, { cx, cy }: ChunkPoint): ChunkRepair {
  return { cx, cy, delta: deltaOfChunk(host, cx, cy) }
}

export function withChunkRepaired(guest: WorldState, repair: ChunkRepair): WorldState {
  return withChunkDelta(guest, repair.cx, repair.cy, repair.delta)
}
