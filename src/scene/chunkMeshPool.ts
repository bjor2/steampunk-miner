/**
 * The chunk meshes under the camera (#4 Rendering, #22): one instanced mesh per visible chunk,
 * all sharing the terrain material, so a chunk is one draw call. Each chunk draws only the tiles
 * of its 8 m ground blocks inside the view circle (#38 visible-block budget). The ONLY writer of
 * terrain meshes. Which blocks are visible, and what each chunk's instances are, are the pure
 * rules in `systems/render`; this module turns them into three objects.
 *
 * Work happens only when something changed: the visible set is recomputed when the camera enters
 * another tile or the screen is resized (a changed block set only copies instance runs), chunk
 * versions are checked when the world changes, and a frame's chunk work runs under the 2 ms of #4
 * (`chunkFrameWorkOf`, ticket 336): the generation the picked builds' halos lack, then at most
 * `chunkBuildsPerFrame` builds, more the faster the rig goes, in `chunksToBuild`'s order: chunks
 * coming into view first, then stale ones, each rebuilt at most once in 4 frames, then the chunks
 * ahead along the velocity and the drill's facing (tickets 330 and 336). A chunk whose neighbours
 * changed only away from its halo's edge keeps its mesh. An edit shows in a built chunk's density
 * halo the frame it lands, ahead of the rebuild (ticket 570). A frame where nothing changed
 * allocates nothing.
 *
 * With the chunk worker up (TD scope c2 on #316, ticket 337) the same picks become worker jobs and
 * the frame only turns fresh results into meshes (`chunkJobStream.ts`); the generation and the tile
 * batches leave the main thread. Without it (node, the dev server, a failed worker) they are built
 * here, from the same pure `buildChunkMeshParts`.
 */
import type { Group, ShaderMaterial } from 'three'
import type { ChunkWorkerPort } from '../shell/chunkWorkerPort'
import { prefetchLeadSeconds } from '../systems/render/chunkBuildBudget'
import { aheadChunksOf, chunkNeedsOf, type ChunkNeed } from './chunkBuildNeeds'
import {
  chunkJobsOf,
  forgetChunkJobs,
  isJobStreamDone,
  isWorkerMeshing,
  postChunkJobs,
  readChunkResults,
  type ChunkJobs,
  type MeshPartsSink,
} from './chunkJobStream'
import { buildsPerFrameOf, streamChunkFrame } from './chunkStreamFrame'
import { chunkMeshOf, disposeChunkMesh, showBlocks, type ChunkMesh } from './chunkMeshGeometry'
import { buildChunkMeshParts } from '../systems/render/chunkMeshParts'
import {
  drawnBlockCountOf,
  gateBitsOfDrawnTile,
  shownChunksOf,
  visibleGroundBlocksAround,
  type ShownChunk,
} from '../systems/render/groundBlocks'
import type { Vector2 } from '../systems/vehicle/localFrame'
import type { PlanetParams } from '../systems/world/planetParams'
import { chunkKey, chunkOfTile, firstTileOfChunk, type TilePoint } from '../systems/world/tileGrid'
import { currentDensityOfChunk, type WorldState } from '../systems/world/worldState'
import {
  chunkViewVersionOf,
  isSameChunkView,
  writeHaloChangesSince,
} from '../systems/render/chunkViewVersion'
import type { ChunkDensity } from '../systems/render/densityHalo'

/** What the terrain should show this frame; the caller reuses one object across frames. */
export interface TerrainView {
  params: PlanetParams
  world: WorldState
  centre: Vector2
  viewRadius: number
  /** The drill's facing as a unit vector: chunks this way are built ahead of the view. */
  ahead: Vector2
  /** The rig's velocity, metres a second: chunks along it are built ahead too (ticket 336). */
  velocity: Vector2
}

export interface ChunkMeshPool {
  sync(view: Readonly<TerrainView>): void
  /** Chunk meshes drawn now: the #22 budget counts these draw calls. */
  drawnChunkCount(): number
  /** 8 m ground blocks drawn now: the #38 budget allows 48 at the 20 m zoom-out. */
  drawnBlockCount(): number
  /** Chunk meshes built now, drawn or hidden: what the pool holds on the GPU (#121). */
  builtChunkCount(): number
  /** A drawn tile's gate bits, or null where no tile is drawn now (ticket 299 debug reads). */
  gateBitsAt(tile: TilePoint): number | null
  /** The chunk worker builds the meshes now (ticket 337), not the main thread. */
  isWorkerMeshing(): boolean
  /** Chunks in view with no mesh yet: a hole in the ground until one is built (ticket 337). */
  unbuiltVisibleChunkCount(): number
  dispose(): void
}

interface PoolState {
  meshes: Map<string, ChunkMesh>
  visible: ShownChunk[]
  /** Chunks ahead of the view, built with the builds left over (no block shown). */
  ahead: ShownChunk[]
  /** The visible and ahead chunks by key: the ones the pool keeps a mesh for. */
  kept: Map<string, ShownChunk>
  /** The chunk worker and its jobs, or null where meshes are built on the main thread. */
  jobs: ChunkJobs | null
  /** Frames synced so far: the clock of the rebuild cap. */
  frame: number
  /** Chunks that needed a build last frame: the queue the prefetch lead outruns. */
  queueLength: number
  tileX: number
  tileY: number
  viewRadius: number
  world: WorldState | null
  /** The world the meshes' halos were last brought up to (ticket 570). */
  haloWorld: WorldState | null
  params: PlanetParams | null
  isUpToDate: boolean
}

/** `worker` builds the meshes off the main thread once it is ready; null builds them here. */
export function createChunkMeshPool(
  parent: Group,
  material: ShaderMaterial,
  worker: ChunkWorkerPort | null,
): ChunkMeshPool {
  const pool: PoolState = {
    meshes: new Map(),
    visible: [],
    ahead: [],
    kept: new Map(),
    jobs: worker === null ? null : chunkJobsOf(worker),
    frame: 0,
    queueLength: 0,
    tileX: Number.NaN,
    tileY: Number.NaN,
    viewRadius: Number.NaN,
    world: null,
    haloWorld: null,
    params: null,
    isUpToDate: false,
  }
  return {
    sync(view) {
      pool.frame++
      if (pool.isUpToDate && isSameView(pool, view)) return
      if (pool.params !== view.params) dropAll(pool, parent)
      if (!isSameVisibleSet(pool, view)) chooseVisible(pool, parent, view)
      pool.world = view.world
      pool.isUpToDate = rebuildStale(pool, parent, material, view)
      showEditsInHalos(pool, view)
    },
    drawnChunkCount: () => countDrawn(pool),
    drawnBlockCount: () => countDrawnBlocks(pool),
    builtChunkCount: () => pool.meshes.size,
    gateBitsAt: (tile) => gateBitsOfTile(pool, tile),
    isWorkerMeshing: () => isWorkerMeshing(pool.jobs),
    unbuiltVisibleChunkCount: () => countUnbuiltVisible(pool),
    dispose: () => dropAll(pool, parent),
  }
}

function countDrawn(pool: PoolState): number {
  let drawn = 0
  for (const chunk of pool.meshes.values()) if (chunk.mesh.visible) drawn++
  return drawn
}

function countUnbuiltVisible(pool: PoolState): number {
  let unbuilt = 0
  for (const { cx, cy } of pool.visible) if (!pool.meshes.has(chunkKey(cx, cy))) unbuilt++
  return unbuilt
}

function countDrawnBlocks(pool: PoolState): number {
  let drawn = 0
  for (const chunk of pool.meshes.values()) drawn += drawnBlockCountOf(chunk.batch, chunk.blockMask)
  return drawn
}

function gateBitsOfTile(pool: PoolState, { tx, ty }: TilePoint): number | null {
  const [cx, cy] = [chunkOfTile(tx), chunkOfTile(ty)]
  const chunk = pool.meshes.get(chunkKey(cx, cy))
  if (chunk === undefined || !chunk.mesh.visible) return null
  return gateBitsOfDrawnTile(chunk.drawn, tx - firstTileOfChunk(cx), ty - firstTileOfChunk(cy))
}

function isSameView(pool: PoolState, view: TerrainView): boolean {
  return pool.world === view.world && pool.params === view.params && isSameVisibleSet(pool, view)
}

function isSameVisibleSet(pool: PoolState, view: TerrainView): boolean {
  const isSameTile =
    pool.tileX === Math.floor(view.centre.x) && pool.tileY === Math.floor(view.centre.y)
  return isSameTile && pool.viewRadius === view.viewRadius && pool.params === view.params
}

function chooseVisible(pool: PoolState, parent: Group, view: TerrainView): void {
  pool.tileX = Math.floor(view.centre.x)
  pool.tileY = Math.floor(view.centre.y)
  pool.viewRadius = view.viewRadius
  pool.params = view.params
  const blocks = visibleGroundBlocksAround(view.centre, view.viewRadius, view.params.radiusTiles)
  pool.visible = shownChunksOf(blocks)
  pool.ahead = aheadChunksOf(view, prefetchLeadSeconds(pool.queueLength, buildsPerFrameOf(view)))
  pool.kept = keptChunksOf(pool.visible, pool.ahead)
  dropHidden(pool, parent)
  showVisibleBlocks(pool)
}

/** Chunks already built draw their newly shown blocks at once; stale ones on their rebuild. */
function showVisibleBlocks(pool: PoolState): void {
  for (const { cx, cy, blockMask } of pool.visible) {
    const chunk = pool.meshes.get(chunkKey(cx, cy))
    if (chunk !== undefined && chunk.blockMask !== blockMask) showBlocks(chunk, blockMask)
  }
}

/** Visible chunks win over ahead ones: theirs is the block mask that shows. */
function keptChunksOf(
  visible: readonly ShownChunk[],
  ahead: readonly ShownChunk[],
): Map<string, ShownChunk> {
  const kept = new Map<string, ShownChunk>()
  for (const shown of [...ahead, ...visible]) kept.set(chunkKey(shown.cx, shown.cy), shown)
  return kept
}

function dropHidden(pool: PoolState, parent: Group): void {
  for (const [key, chunk] of pool.meshes) {
    if (pool.kept.has(key)) continue
    disposeChunkMesh(parent, chunk)
    pool.meshes.delete(key)
  }
}

function dropAll(pool: PoolState, parent: Group): void {
  for (const chunk of pool.meshes.values()) disposeChunkMesh(parent, chunk)
  pool.meshes.clear()
  forgetChunkJobs(pool.jobs)
  pool.isUpToDate = false
}

/**
 * Each mesh's density halo brought up to an edited world the frame the edit lands (ticket 570):
 * only the halo, a texture upload, so a cut's face moves with its front every tick while the
 * chunk's tiles are rebuilt at most once in 4 frames (ticket 330).
 */
function showEditsInHalos(pool: PoolState, view: TerrainView): void {
  if (pool.haloWorld === view.world) return
  pool.haloWorld = view.world
  const densityOf = (cx: number, cy: number) =>
    currentDensityOfChunk(view.world, view.params, cx, cy)
  for (const chunk of pool.meshes.values()) showEditsInHalo(chunk, view.world, densityOf)
}

function showEditsInHalo(chunk: ChunkMesh, world: WorldState, densityOf: ChunkDensity): void {
  const now = chunkViewVersionOf(world, chunk.cx, chunk.cy)
  if (isSameChunkView(chunk.haloVersion, now)) return
  const isEdgeMoved = writeHaloChangesSince(chunk.halo, densityOf, chunk, chunk.haloVersion, now)
  chunk.isHaloEdgeMoved ||= isEdgeMoved
  chunk.haloVersion = now
  chunk.density.needsUpdate = true
}

/** Runs the frame's chunk work under its budget; true when every visible and ahead chunk is current. */
function rebuildStale(
  pool: PoolState,
  parent: Group,
  material: ShaderMaterial,
  view: TerrainView,
): boolean {
  const sink = meshPartsSinkOf(pool, parent, material)
  if (isWorkerMeshing(pool.jobs)) return streamThroughWorker(pool, pool.jobs, view, sink)
  return streamOnMainThread(pool, view, sink)
}

/** The worker's results first, so the needs see the meshes they made; then the frame's jobs. */
function streamThroughWorker(
  pool: PoolState,
  jobs: ChunkJobs,
  view: TerrainView,
  sink: MeshPartsSink,
): boolean {
  readChunkResults(jobs, sink)
  const needs = chunkNeedsOf(pool, view)
  pool.queueLength = needs.length
  postChunkJobs(jobs, needs, pool.frame, view)
  return isJobStreamDone(jobs, needs)
}

function streamOnMainThread(pool: PoolState, view: TerrainView, sink: MeshPartsSink): boolean {
  const needs = chunkNeedsOf(pool, view)
  pool.queueLength = needs.length
  const build = ({ key, cx, cy, version }: ChunkNeed) =>
    sink(key, { version, frame: pool.frame }, buildChunkMeshParts(view.params, view.world, cx, cy))
  return streamChunkFrame(needs, pool.frame, view, build)
}

/** A chunk the view stopped keeping while its parts were built gets no mesh. */
function meshPartsSinkOf(pool: PoolState, parent: Group, material: ShaderMaterial): MeshPartsSink {
  return (key, built, parts) => {
    const shown = pool.kept.get(key)
    if (shown === undefined) return
    replaceChunkMesh(pool, parent, key, chunkMeshOf(material, shown, built, parts))
  }
}

function replaceChunkMesh(pool: PoolState, parent: Group, key: string, next: ChunkMesh): void {
  const current = pool.meshes.get(key)
  if (current !== undefined) disposeChunkMesh(parent, current)
  pool.meshes.set(key, next)
  parent.add(next.mesh)
}
