/**
 * The three objects of one chunk mesh (#4 Rendering, #22): its instance arrays sized for a whole
 * chunk, its density halo as a texture, and the instanced unit-quad geometry that draws them. Split
 * from `chunkMeshPool.ts`, which owns when they are built and dropped.
 */
import {
  DataTexture,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  LinearFilter,
  PlaneGeometry,
  RedFormat,
  UnsignedByteType,
} from 'three'
import { DENSITY_HALO_SIDE } from '../systems/render/densityHalo'
import type { TileInstances } from '../systems/render/groundBlocks'
import { CHUNK_CELLS } from '../systems/world/tileGrid'

export const INSTANCE_ATTRIBUTES = ['aTile', 'aBase', 'aOre', 'aStyle', 'aGate'] as const

/** Sized for a whole chunk, so showing more blocks never reallocates. */
export function emptyInstances(): TileInstances {
  return {
    count: 0,
    tiles: new Float32Array(CHUNK_CELLS * 2),
    baseColours: new Float32Array(CHUNK_CELLS * 3),
    oreColours: new Float32Array(CHUNK_CELLS * 4),
    styles: new Float32Array(CHUNK_CELLS * 4),
    gates: new Float32Array(CHUNK_CELLS),
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
  geometry.instanceCount = batch.count
  return geometry
}
