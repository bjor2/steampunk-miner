/**
 * The chunk meshes under the camera (#4 Rendering, #22): one instanced mesh per visible chunk,
 * all sharing the terrain material, so a chunk is one draw call. The ONLY writer of terrain
 * meshes. Which chunks are visible, and what each one's instances are, are the pure rules in
 * `systems/render`; this module turns them into three objects.
 *
 * Work happens only when something changed: the visible set is recomputed when the camera enters
 * another tile or the screen is resized, chunk versions are checked when the world changes, and
 * at most `CHUNK_BUILDS_PER_FRAME` stale chunks are rebuilt per frame, nearest first (#4: terrain
 * updates under 2 ms per frame). A frame where nothing changed allocates nothing.
 */
import {
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  Mesh,
  PlaneGeometry,
  type Group,
  type ShaderMaterial,
} from 'three'
import { CHUNK_BUILDS_PER_FRAME } from '../constants/scene'
import { buildChunkTileBatch, type ChunkTileBatch } from '../systems/render/chunkTileBatch'
import {
  chunkViewVersionOf,
  isSameChunkView,
  type ChunkViewVersion,
} from '../systems/render/chunkViewVersion'
import { visibleChunksAround, type ChunkPoint } from '../systems/render/visibleChunks'
import type { Vector2 } from '../systems/vehicle/localFrame'
import type { PlanetParams } from '../systems/world/planetParams'
import { chunkKey, firstTileOfChunk } from '../systems/world/tileGrid'
import { cellAt, currentCellsOfChunk, type WorldState } from '../systems/world/worldState'

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
  dispose(): void
}

interface ChunkMesh {
  mesh: Mesh
  version: ChunkViewVersion
}

interface PoolState {
  meshes: Map<string, ChunkMesh>
  visible: ChunkPoint[]
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
    dispose: () => dropAll(pool, parent),
  }
}

function countDrawn(pool: PoolState): number {
  let drawn = 0
  for (const chunk of pool.meshes.values()) if (chunk.mesh.visible) drawn++
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
  pool.visible = visibleChunksAround(view.centre, view.viewRadius, view.params.radiusTiles)
  dropHidden(pool, parent)
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
  for (const { cx, cy } of pool.visible) {
    const key = chunkKey(cx, cy)
    const version = chunkViewVersionOf(view.world, cx, cy)
    const current = pool.meshes.get(key)
    if (current !== undefined && isSameChunkView(current.version, version)) continue
    if (builds === CHUNK_BUILDS_PER_FRAME) return false
    replaceChunkMesh(pool, parent, key, buildChunkMesh(material, view, cx, cy, version))
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
  cx: number,
  cy: number,
  version: ChunkViewVersion,
): ChunkMesh {
  const { params, world } = view
  const cells = currentCellsOfChunk(world, params, cx, cy)
  const batch = buildChunkTileBatch(params, cx, cy, cells, (tx, ty) =>
    cellAt(world, params, { tx, ty }),
  )
  const mesh = new Mesh(geometryOf(batch), material)
  mesh.position.set(firstTileOfChunk(cx), firstTileOfChunk(cy), 0)
  // Culled by the view circle above; three's own test would use the unit quad's bounds.
  mesh.frustumCulled = false
  // A chunk of air (a cave, the dock clearance) keeps its version but issues no draw call.
  mesh.visible = batch.count > 0
  return { mesh, version }
}

/** A unit quad drawn once per tile; each chunk owns its copy, so disposing it is local. */
function geometryOf(batch: ChunkTileBatch): InstancedBufferGeometry {
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
}
