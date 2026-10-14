/**
 * Which chunk meshes need a build (#4 Rendering; TD scope on #316, tickets 330 and 336): the visible
 * chunks, then those ahead along the velocity and the drill's facing, each missing its mesh or
 * showing a stale view. A mesh whose neighbours changed only away from its halo's edge is still
 * current: it takes the new version and is not rebuilt, so a cut inside a chunk rebuilds that chunk
 * alone. Split from `chunkMeshPool.ts`, which builds what `chunksToBuild` picks of these.
 */
import type { ChunkBuildNeed } from '../systems/render/chunkBuilds'
import { chunksAheadOf } from '../systems/render/chunkPrefetch'
import {
  chunkViewVersionOf,
  isHaloEdgeCurrentSince,
  isOwnChunkSame,
  isSameChunkView,
  type ChunkViewVersion,
} from '../systems/render/chunkViewVersion'
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
  /** The drill's facing, a unit vector. */
  ahead: Vector2
  /** The rig's velocity, metres a second. */
  velocity: Vector2
}

/** A chunk that needs a build, with what building it takes. */
export interface ChunkNeed extends ChunkBuildNeed {
  shown: ShownChunk
  version: ChunkViewVersion
}

/**
 * The chunks ahead along the velocity, `leadSeconds` of it, and the drill's facing, built with no
 * block shown until they come into view.
 */
export function aheadChunksOf(view: AheadView, leadSeconds: number): ShownChunk[] {
  const ahead = chunksAheadOf({
    centre: view.centre,
    viewRadius: view.viewRadius,
    velocity: view.velocity,
    facing: view.ahead,
    leadSeconds,
    planetRadiusTiles: view.params.radiusTiles,
  })
  return ahead.map(({ cx, cy }) => ({ cx, cy, blockMask: 0 }))
}

/** The visible chunks nearest first, then the ahead ones in order, whose mesh is missing or stale. */
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
  const { cx, cy } = shown
  return [{ key, cx, cy, isVisible, isBuilt: current !== undefined, builtFrame, shown, version }]
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
  const { halo, cx, cy } = chunk
  if (!isHaloEdgeCurrentSince(halo, densityOf, cx, cy, chunk.version, version)) return false
  chunk.version = version
  return true
}
