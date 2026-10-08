/**
 * When a chunk's mesh is stale (#4: "rebuilt only when `version` changes"). The world is
 * immutable and a ground change gives its chunk a new delta object, so the delta's identity is the
 * chunk's version. The right, upper and upper-right neighbours count too: their first samples are
 * in this chunk's density halo (#36).
 */
import type { ChunkDelta } from '../world/chunkDelta'
import { chunkKey } from '../world/tileGrid'
import type { WorldState } from '../world/worldState'

export type ChunkViewVersion = readonly (ChunkDelta | undefined)[]

export function chunkViewVersionOf(world: WorldState, cx: number, cy: number): ChunkViewVersion {
  return [
    world.chunks[chunkKey(cx, cy)],
    world.chunks[chunkKey(cx + 1, cy)],
    world.chunks[chunkKey(cx, cy + 1)],
    world.chunks[chunkKey(cx + 1, cy + 1)],
  ]
}

export function isSameChunkView(a: ChunkViewVersion, b: ChunkViewVersion): boolean {
  return a.every((delta, index) => delta === b[index])
}

/**
 * Only the neighbours changed, not the chunk itself (ticket 330): its mesh is then still current
 * if their edge samples in its halo are (`isHaloEdgeCurrent`), so a cut inside a chunk rebuilds
 * that chunk alone, not the three whose views read it.
 */
export function isOwnChunkSame(built: ChunkViewVersion, now: ChunkViewVersion): boolean {
  return built[0] === now[0]
}
