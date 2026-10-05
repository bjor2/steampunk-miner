/**
 * The chunk meshes under the camera (#4 Rendering, #22): one instanced mesh per visible chunk,
 * all sharing the terrain material, so a chunk is one draw call. Each chunk draws only the tiles
 * of its 8 m ground blocks inside the view circle (#38 visible-block budget). The ONLY writer of
 * terrain meshes. Which blocks are visible, and what each chunk's instances are, are the pure
 * rules in `systems/render`; this module turns them into three objects.
 *
 * Work happens only when something changed: the visible set is recomputed when the camera enters
 * another tile or the screen is resized (a changed block set only copies instance runs), chunk versions are checked when the world changes, and
 * at most `CHUNK_BUILDS_PER_FRAME` stale chunks are rebuilt per frame, nearest first (#4: terrain
 * updates under 2 ms per frame). A frame where nothing changed allocates nothing.
 */
import {
  DataTexture,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  LinearFilter,
  Mesh,
  PlaneGeometry,
  RedFormat,
  UnsignedByteType,
  type Group,
  type ShaderMaterial,
} from 'three'
import { CHUNK_BUILDS_PER_FRAME } from '../constants/scene'
import { buildChunkTileBatch, type ChunkTileBatch } from '../systems/render/chunkTileBatch'
import { chunkDensityHaloOf, DENSITY_HALO_SIDE } from '../systems/render/densityHalo'
import {
  chunkViewVersionOf,
  isSameChunkView,
  type ChunkViewVersion,
} from '../systems/render/chunkViewVersion'
import {
  copyShownBlocks,
  drawnBlockCountOf,
  shownChunksOf,
  visibleGroundBlocksAround,
  type ShownChunk,
  type TileInstances,
} from '../systems/render/groundBlocks'
import type { Vector2 } from '../systems/vehicle/localFrame'
import type { PlanetParams } from '../systems/world/planetParams'
import { CHUNK_CELLS, chunkKey, firstTileOfChunk } from '../systems/world/tileGrid'
import {
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
}

export interface ChunkMeshPool {
  sync(view: Readonly<TerrainView>): void
  /** Chunk meshes drawn now: the #22 budget counts these draw calls. */
  drawnChunkCount(): number
  /** 8 m ground blocks drawn now: the #38 budget allows 48 at the 20 m zoom-out. */
  drawnBlockCount(): number
  dispose(): void
}

interface ChunkMesh {
  mesh: Mesh
  density: DataTexture
  version: ChunkViewVersion
  batch: ChunkTileBatch
  /** The instances the mesh draws: the tiles of the shown blocks, bound to its geometry. */
  drawn: TileInstances
  blockMask: number
}

interface PoolState {
  meshes: Map<string, ChunkMesh>
  visible: ShownChunk[]
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
    tileX: Number.NaN,
    tileY: Number.NaN,
    viewRadius: Number.NaN,
    world: null,
    params: null,
    isUpToDate: false,
  }
  return {
    sync(view) {
      if (pool.isUpToDate && isSameView(pool, view)) return
      if (pool.params !== view.params) dropAll(pool, parent)
      if (!isSameVisibleSet(pool, view)) chooseVisible(pool, parent, view)
      pool.world = view.world
      pool.isUpToDate = rebuildStale(pool, parent, material, view)
    },
    drawnChunkCount: () => countDrawn(pool),
    drawnBlockCount: () => countDrawnBlocks(pool),
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
  const wanted = new Set(pool.visible.map(({ cx, cy }) => chunkKey(cx, cy)))
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

/** Rebuilds up to the per-frame budget; true when every visible chunk is current. */
function rebuildStale(
  pool: PoolState,
  parent: Group,
  material: ShaderMaterial,
  view: TerrainView,
): boolean {
  let builds = 0
  for (const { cx, cy, blockMask } of pool.visible) {
    const key = chunkKey(cx, cy)
    const version = chunkViewVersionOf(view.world, cx, cy)
    const current = pool.meshes.get(key)
    if (current !== undefined && isSameChunkView(current.version, version)) continue
    if (builds === CHUNK_BUILDS_PER_FRAME) return false
    const built = buildChunkMesh(material, view, { cx, cy, blockMask }, version)
    replaceChunkMesh(pool, parent, key, built)
    builds++
  }
  return true
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
  { cx, cy, blockMask }: ShownChunk,
  version: ChunkViewVersion,
): ChunkMesh {
  const { params, world } = view
  const halo = chunkDensityHaloOf((x, y) => currentDensityOfChunk(world, params, x, y), cx, cy)
  const batch = buildChunkTileBatch(
    params,
    cx,
    cy,
    materialCellsOfChunk(world, params, cx, cy),
    halo,
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
  const chunk: ChunkMesh = { mesh, density, version, batch, drawn, blockMask: Number.NaN }
  showBlocks(chunk, blockMask)
  return chunk
}

const INSTANCE_ATTRIBUTES = ['aTile', 'aBase', 'aOre', 'aStyle'] as const

/** Sized for a whole chunk, so showing more blocks never reallocates. */
function emptyInstances(): TileInstances {
  return {
    count: 0,
    tiles: new Float32Array(CHUNK_CELLS * 2),
    baseColours: new Float32Array(CHUNK_CELLS * 3),
    oreColours: new Float32Array(CHUNK_CELLS * 4),
    styles: new Float32Array(CHUNK_CELLS * 4),
  }
}

/** The halo as a one-channel texture, blended linearly between samples like the contour. */
function densityTextureOf(halo: Uint8Array<ArrayBuffer>): DataTexture {
  const texture = new DataTexture(
    halo,
    DENSITY_HALO_SIDE,
    DENSITY_HALO_SIDE,
    RedFormat,
    UnsignedByteType,
  )
  texture.minFilter = LinearFilter
  texture.magFilter = LinearFilter
  // 129-byte rows: tell WebGL they are packed, not padded to 4 bytes.
  texture.unpackAlignment = 1
  texture.needsUpdate = true
  return texture
}

/** A unit quad drawn once per tile; each chunk owns its copy, so disposing it is local. */
function geometryOf(batch: TileInstances): InstancedBufferGeometry {
  const quad = new PlaneGeometry(1, 1)
  const geometry = new InstancedBufferGeometry()
  geometry.index = quad.index
  geometry.setAttribute('position', quad.getAttribute('position'))
  geometry.setAttribute('aTile', new InstancedBufferAttribute(batch.tiles, 2))
  geometry.setAttribute('aBase', new InstancedBufferAttribute(batch.baseColours, 3))
  geometry.setAttribute('aOre', new InstancedBufferAttribute(batch.oreColours, 4))
  geometry.setAttribute('aStyle', new InstancedBufferAttribute(batch.styles, 4))
  geometry.instanceCount = batch.count
  return geometry
}

function disposeChunkMesh(parent: Group, chunk: ChunkMesh): void {
  parent.remove(chunk.mesh)
  chunk.mesh.geometry.dispose()
  chunk.density.dispose()
}
