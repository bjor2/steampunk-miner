/**
 * The three objects of one chunk mesh (#4 Rendering, #22): its instance arrays sized for a whole
 * chunk, its density halo as a texture, and the instanced unit-quad geometry that draws them, made
 * from the chunk's mesh parts wherever those were built (ticket 337). Split from
 * `chunkMeshPool.ts`, which owns when they are built and dropped.
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
import type { JobView } from '../systems/render/chunkJobBook'
import type { ChunkMeshParts } from '../systems/render/chunkMeshParts'
import type { ChunkTileBatch } from '../systems/render/chunkTileBatch'
import type { ChunkViewVersion } from '../systems/render/chunkViewVersion'
import { DENSITY_HALO_SIDE } from '../systems/render/densityHalo'
import {
  copyShownBlocks,
  type ShownChunk,
  type TileInstances,
} from '../systems/render/groundBlocks'
import { CHUNK_CELLS, firstTileOfChunk } from '../systems/world/tileGrid'

export const INSTANCE_ATTRIBUTES = ['aTile', 'aBase', 'aOre', 'aStyle', 'aGate', 'aKind'] as const

/** Sized for a whole chunk, so showing more blocks never reallocates. */
export function emptyInstances(): TileInstances {
  return {
    count: 0,
    tiles: new Float32Array(CHUNK_CELLS * 2),
    baseColours: new Float32Array(CHUNK_CELLS * 3),
    oreColours: new Float32Array(CHUNK_CELLS * 4),
    styles: new Float32Array(CHUNK_CELLS * 4),
    gates: new Float32Array(CHUNK_CELLS),
    kinds: new Float32Array(CHUNK_CELLS),
  }
}

/** The halo as a one-channel texture, blended linearly between samples like the contour. */
export function densityTextureOf(halo: Uint8Array<ArrayBuffer>): DataTexture {
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
export function geometryOf(batch: TileInstances): InstancedBufferGeometry {
  const quad = new PlaneGeometry(1, 1)
  const geometry = new InstancedBufferGeometry()
  geometry.index = quad.index
  geometry.setAttribute('position', quad.getAttribute('position'))
  geometry.setAttribute('aTile', new InstancedBufferAttribute(batch.tiles, 2))
  geometry.setAttribute('aBase', new InstancedBufferAttribute(batch.baseColours, 3))
  geometry.setAttribute('aOre', new InstancedBufferAttribute(batch.oreColours, 4))
  geometry.setAttribute('aStyle', new InstancedBufferAttribute(batch.styles, 4))
  geometry.setAttribute('aGate', new InstancedBufferAttribute(batch.gates, 1))
  geometry.setAttribute('aKind', new InstancedBufferAttribute(batch.kinds, 1))
  geometry.instanceCount = batch.count
  return geometry
}

export interface ChunkMesh {
  cx: number
  cy: number
  mesh: Mesh
  density: DataTexture
  /** The density halo the texture shows, kept to check its neighbours' edges. */
  halo: Uint8Array
  /** The pool frame that read the world it shows: the rebuild cap counts from it. */
  builtFrame: number
  version: ChunkViewVersion
  /** The view the halo shows: ahead of `version` once an edit reached it before the rebuild. */
  haloVersion: ChunkViewVersion
  batch: ChunkTileBatch
  /** The instances the mesh draws: the tiles of the shown blocks, bound to its geometry. */
  drawn: TileInstances
  blockMask: number
}

/** The mesh of a chunk's parts, showing `shown`'s blocks, built from the view `built`. */
export function chunkMeshOf(
  material: ShaderMaterial,
  { cx, cy, blockMask }: ShownChunk,
  built: JobView,
  { batch, halo }: ChunkMeshParts,
): ChunkMesh {
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
    builtFrame: built.frame,
    version: built.version,
    haloVersion: built.version,
    batch,
    drawn,
    blockMask: Number.NaN,
  }
  showBlocks(chunk, blockMask)
  return chunk
}

export function showBlocks(chunk: ChunkMesh, blockMask: number): void {
  chunk.blockMask = blockMask
  copyShownBlocks(chunk.batch, blockMask, chunk.drawn)
  const geometry = chunk.mesh.geometry as InstancedBufferGeometry
  for (const name of INSTANCE_ATTRIBUTES) geometry.getAttribute(name).needsUpdate = true
  geometry.instanceCount = chunk.drawn.count
  // A chunk with no ground in view (space, a cave) keeps its version but issues no draw call.
  chunk.mesh.visible = chunk.drawn.count > 0
}

export function disposeChunkMesh(parent: Group, chunk: ChunkMesh): void {
  parent.remove(chunk.mesh)
  chunk.mesh.geometry.dispose()
  chunk.density.dispose()
}
