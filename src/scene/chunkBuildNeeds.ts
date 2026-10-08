/**
 * Which chunk meshes need a build (#4 Rendering; TD scope on #316, ticket 330): the visible chunks,
 * then those ahead along the drill's facing, each missing its mesh or showing a stale view. A mesh
 * whose neighbours changed only away from its halo's edge is still current: it takes the new
 * version and is not rebuilt, so a cut inside a chunk rebuilds that chunk alone. Split from
 * `chunkMeshPool.ts`, which builds what `chunksToBuild` picks of these.
 */
import type { ChunkBuildNeed } from '../systems/render/chunkBuilds'
import { chunksAheadOf } from '../systems/render/chunkPrefetch'
import {
  chunkViewVersionOf,
  isOwnChunkSame,
  isSameChunkView,
  type ChunkViewVersion,
} from '../systems/render/chunkViewVersion'
import { isHaloEdgeCurrent } from '../systems/render/densityHalo'
import type { ShownChunk } from '../systems/render/groundBlocks'
import type { Vector2 } from '../systems/vehicle/localFrame'
import type { PlanetParams } from '../systems/world/planetParams'
import { chunkKey } from '../systems/world/tileGrid'
import { currentDensityOfChunk, type WorldState } from '../systems/world/worldState'

/** A built mesh as the needs read it: its chunk, halo, build frame and the view it shows. */
export interface BuiltChunk {
  cx: number
  cy: number
  halo: Uint8Array
  builtFrame: number
  version: ChunkViewVersion
}

/** The chunks the pool keeps, and their meshes by chunk key. */
export interface ChunksToKeep {
  meshes: ReadonlyMap<string, BuiltChunk>
  visible: readonly ShownChunk[]
  ahead: readonly ShownChunk[]
}

/** The world the needs are checked against. */
export interface NeedView {
  params: PlanetParams
  world: WorldState
}

/** Where the chunks ahead are looked for. */
export interface AheadView {
  params: PlanetParams
  centre: Vector2
  viewRadius: number
  ahead: Vector2
}

/** A chunk that needs a build, with what building it takes. */
export interface ChunkNeed extends ChunkBuildNeed {
  shown: ShownChunk
  version: ChunkViewVersion
}

/** The chunks ahead along the drill's facing, built with no block shown until they come into view. */
export function aheadChunksOf(view: AheadView): ShownChunk[] {
  const ahead = chunksAheadOf(view.centre, view.viewRadius, view.ahead, view.params.radiusTiles)
  return ahead.map(({ cx, cy }) => ({ cx, cy, blockMask: 0 }))
}

/** The visible chunks, then the ahead ones, nearest first, whose mesh is missing or stale. */
export function chunkNeedsOf(chunks: ChunksToKeep, view: NeedView): ChunkNeed[] {
  return [
    ...chunks.visible.flatMap((shown) => needOf(chunks.meshes, view, shown, true)),
    ...chunks.ahead.flatMap((shown) => needOf(chunks.meshes, view, shown, false)),
  ]
}

function needOf(
  meshes: ReadonlyMap<string, BuiltChunk>,
  view: NeedView,
  shown: ShownChunk,
  isVisible: boolean,
): ChunkNeed[] {
  const key = chunkKey(shown.cx, shown.cy)
  const version = chunkViewVersionOf(view.world, shown.cx, shown.cy)
  const current = meshes.get(key)
  if (current !== undefined && isCurrentAfterAdopting(current, version, view)) return []
  const builtFrame = current?.builtFrame ?? 0
  return [{ key, isVisible, isBuilt: current !== undefined, builtFrame, shown, version }]
}

/**
 * Whether the mesh still shows its chunk: the same view, or only neighbours changed away from its
 * halo's edge, in which case it takes the new version without a rebuild.
 */
function isCurrentAfterAdopting(
  chunk: BuiltChunk,
  version: ChunkViewVersion,
  view: NeedView,
): boolean {
  if (isSameChunkView(chunk.version, version)) return true
  if (!isOwnChunkSame(chunk.version, version)) return false
  const densityOf = (x: number, y: number) => currentDensityOfChunk(view.world, view.params, x, y)
  if (!isHaloEdgeCurrent(chunk.halo, densityOf, chunk.cx, chunk.cy)) return false
  chunk.version = version
  return true
}
