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
 * changed only away from its halo's edge keeps its mesh. A frame where nothing changed allocates
 * nothing.
 */
import {
  Mesh,
  type DataTexture,
  type Group,
  type InstancedBufferGeometry,
  type ShaderMaterial,
} from 'three'
import { prefetchLeadSeconds } from '../systems/render/chunkBuildBudget'
import { aheadChunksOf, chunkNeedsOf, type ChunkNeed } from './chunkBuildNeeds'
import { buildsPerFrameOf, streamChunkFrame } from './chunkStreamFrame'
import {
  densityTextureOf,
  emptyInstances,
  geometryOf,
  INSTANCE_ATTRIBUTES,
} from './chunkMeshGeometry'
import {
  buildChunkTileBatch,
  NO_REFRACTORY_CELLS,
  type ChunkTileBatch,
} from '../systems/render/chunkTileBatch'
import { refractoryCellsOf } from '../systems/render/refractoryCells'
import { NO_CASING } from '../systems/world/chunkDelta'
import { chunkDensityHaloOf } from '../systems/render/densityHalo'
import type { ChunkViewVersion } from '../systems/render/chunkViewVersion'
import {
  copyShownBlocks,
  drawnBlockCountOf,
  gateBitsOfDrawnTile,
  shownChunksOf,
  visibleGroundBlocksAround,
  type ShownChunk,
  type TileInstances,
} from '../systems/render/groundBlocks'
import type { Vector2 } from '../systems/vehicle/localFrame'
import type { PlanetParams } from '../systems/world/planetParams'
import { chunkKey, chunkOfTile, firstTileOfChunk, type TilePoint } from '../systems/world/tileGrid'
import {
  currentCasingOfChunk,
  currentDensityOfChunk,
  materialCellsOfChunk,
  type WorldState,
} from '../systems/world/worldState'

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
  dispose(): void
}

interface ChunkMesh {
  cx: number
  cy: number
  mesh: Mesh
  density: DataTexture
  /** The density halo the texture shows, kept to check its neighbours' edges. */
  halo: Uint8Array
  /** The pool frame it was built in. */
  builtFrame: number
  version: ChunkViewVersion
  batch: ChunkTileBatch
  /** The instances the mesh draws: the tiles of the shown blocks, bound to its geometry. */
  drawn: TileInstances
  blockMask: number
}

interface PoolState {
  meshes: Map<string, ChunkMesh>
  visible: ShownChunk[]
  /** Chunks ahead of the view, built with the builds left over (no block shown). */
  ahead: ShownChunk[]
  /** Frames synced so far: the clock of the rebuild cap. */
  frame: number
  /** Chunks that needed a build last frame: the queue the prefetch lead outruns. */
  queueLength: number
  tileX: number
  tileY: number
  viewRadius: number
  world: WorldState | null
  params: PlanetParams | null
  isUpToDate: boolean
}

export function createChunkMeshPool(parent: Group, material: ShaderMaterial): ChunkMeshPool {
  const pool: PoolState = {
    meshes: new Map(),
    visible: [],
    ahead: [],
    frame: 0,
    queueLength: 0,
    tileX: Number.NaN,
    tileY: Number.NaN,
    viewRadius: Number.NaN,
    world: null,
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
    },
    drawnChunkCount: () => countDrawn(pool),
    drawnBlockCount: () => countDrawnBlocks(pool),
    builtChunkCount: () => pool.meshes.size,
    gateBitsAt: (tile) => gateBitsOfTile(pool, tile),
    dispose: () => dropAll(pool, parent),
  }
}

function countDrawn(pool: PoolState): number {
  let drawn = 0
  for (const chunk of pool.meshes.values()) if (chunk.mesh.visible) drawn++
  return drawn
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

function showBlocks(chunk: ChunkMesh, blockMask: number): void {
  chunk.blockMask = blockMask
  copyShownBlocks(chunk.batch, blockMask, chunk.drawn)
  const geometry = chunk.mesh.geometry as InstancedBufferGeometry
  for (const name of INSTANCE_ATTRIBUTES) geometry.getAttribute(name).needsUpdate = true
  geometry.instanceCount = chunk.drawn.count
  // A chunk with no ground in view (space, a cave) keeps its version but issues no draw call.
  chunk.mesh.visible = chunk.drawn.count > 0
}

function dropHidden(pool: PoolState, parent: Group): void {
  const wanted = new Set([...pool.visible, ...pool.ahead].map(({ cx, cy }) => chunkKey(cx, cy)))
  for (const [key, chunk] of pool.meshes) {
    if (wanted.has(key)) continue
    disposeChunkMesh(parent, chunk)
    pool.meshes.delete(key)
  }
}

function dropAll(pool: PoolState, parent: Group): void {
  for (const chunk of pool.meshes.values()) disposeChunkMesh(parent, chunk)
  pool.meshes.clear()
  pool.isUpToDate = false
}

/** Runs the frame's chunk work under its budget; true when every visible and ahead chunk is current. */
function rebuildStale(
  pool: PoolState,
  parent: Group,
  material: ShaderMaterial,
  view: TerrainView,
): boolean {
  const needs = chunkNeedsOf(pool, view)
  pool.queueLength = needs.length
  const build = (need: ChunkNeed) =>
    replaceChunkMesh(pool, parent, need.key, buildChunkMesh(material, view, need, pool.frame))
  return streamChunkFrame(needs, pool.frame, view, build)
}

function replaceChunkMesh(pool: PoolState, parent: Group, key: string, next: ChunkMesh): void {
  const current = pool.meshes.get(key)
  if (current !== undefined) disposeChunkMesh(parent, current)
  pool.meshes.set(key, next)
  parent.add(next.mesh)
}

function buildChunkMesh(
  material: ShaderMaterial,
  view: TerrainView,
  { shown, version }: ChunkNeed,
  builtFrame: number,
): ChunkMesh {
  const { cx, cy, blockMask } = shown
  const { params, world } = view
  const halo = chunkDensityHaloOf((x, y) => currentDensityOfChunk(world, params, x, y), cx, cy)
  const batch = buildChunkTileBatch(
    params,
    cx,
    cy,
    materialCellsOfChunk(world, params, cx, cy),
    halo,
    refractoryCellsOfChunk(world, cx, cy),
  )
  const density = densityTextureOf(halo)
  const drawn = emptyInstances()
  const mesh = new Mesh(geometryOf(drawn), material)
  mesh.position.set(firstTileOfChunk(cx), firstTileOfChunk(cy), 0)
  // Culled by the view circle above; three's own test would use the unit quad's bounds.
  mesh.frustumCulled = false
  // One material draws every chunk; each hands it its own density just before drawing.
  mesh.onBeforeRender = () => {
    material.uniforms.uDensity.value = density
    material.uniformsNeedUpdate = true
  }
  const chunk: ChunkMesh = {
    cx,
    cy,
    mesh,
    density,
    halo,
    builtFrame,
    version,
    batch,
    drawn,
    blockMask: Number.NaN,
  }
  showBlocks(chunk, blockMask)
  return chunk
}

/** The cells to draw as refractory lining (#113); none, without a copy, for an unlined chunk. */
function refractoryCellsOfChunk(world: WorldState, cx: number, cy: number): Uint8Array {
  const casing = currentCasingOfChunk(world, cx, cy)
  return casing === NO_CASING ? NO_REFRACTORY_CELLS : refractoryCellsOf(casing)
}

function disposeChunkMesh(parent: Group, chunk: ChunkMesh): void {
  parent.remove(chunk.mesh)
  chunk.mesh.geometry.dispose()
  chunk.density.dispose()
}
