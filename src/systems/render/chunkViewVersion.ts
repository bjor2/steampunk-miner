/**
 * When a chunk's mesh is stale (#4: "rebuilt only when `version` changes"). The world is
 * immutable and a ground change gives its chunk a new delta object, so the delta's identity is the
 * chunk's version. The right, upper and upper-right neighbours count too: their first samples are
 * in this chunk's density halo (#36).
 */
import type { ChunkDelta } from '../world/chunkDelta'
import { chunkKey } from '../world/tileGrid'
import type { WorldState } from '../world/worldState'
import {
  isCornerCurrent,
  isRightEdgeCurrent,
  isTopEdgeCurrent,
  writeCorner,
  writeOwnSamples,
  writeRightEdge,
  writeTopEdge,
  type ChunkDensity,
} from './densityHalo'

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

/**
 * `isHaloEdgeCurrent`, reading only the neighbours whose delta changed since the halo was built
 * (ticket 337): an unchanged delta is an unchanged density, and reading an untouched neighbour
 * would generate it on the main thread, which is the chunk worker's job now.
 */
export function isHaloEdgeCurrentSince(
  halo: Uint8Array,
  densityOf: ChunkDensity,
  cx: number,
  cy: number,
  built: ChunkViewVersion,
  now: ChunkViewVersion,
): boolean {
  const isKept = (neighbour: number) => built[neighbour] === now[neighbour]
  return (
    (isKept(1) || isRightEdgeCurrent(halo, densityOf(cx + 1, cy))) &&
    (isKept(2) || isTopEdgeCurrent(halo, densityOf(cx, cy + 1))) &&
    (isKept(3) || isCornerCurrent(halo, densityOf(cx + 1, cy + 1)))
  )
}

/**
 * The halo brought up to the world's view `now` in place (ticket 570): the parts whose chunk's
 * delta changed since `shown`, the view it holds, are read again, the rest left alone (reading an
 * untouched neighbour would generate it on the main thread, ticket 337). The renderer does this
 * every frame the world changes, so a cut's face shows the frame the authority carves it, while
 * the chunk's tiles wait for their rebuild under the cap of ticket 330. Answers whether a
 * neighbour's edge moved: the halo then no longer tells whether the tiles' view is current
 * (`isHaloEdgeCurrentSince`), so the mesh is rebuilt.
 */
export function writeHaloChangesSince(
  halo: Uint8Array,
  densityOf: ChunkDensity,
  { cx, cy }: { cx: number; cy: number },
  shown: ChunkViewVersion,
  now: ChunkViewVersion,
): boolean {
  if (shown[0] !== now[0]) writeOwnSamples(halo, densityOf(cx, cy))
  const isRightMoved = shown[1] !== now[1] && writeRightEdge(halo, densityOf(cx + 1, cy))
  const isTopMoved = shown[2] !== now[2] && writeTopEdge(halo, densityOf(cx, cy + 1))
  const isCornerMoved = shown[3] !== now[3] && writeCorner(halo, densityOf(cx + 1, cy + 1))
  return isRightMoved || isTopMoved || isCornerMoved
}
