/**
 * Value noise on an integer lattice (decision #4: "clustering and caves use value noise on an
 * integer lattice built from the same hash"). Corner values are `hashCell` values, so the noise
 * at a tile depends only on the seed and the tile, never on generation order. Blending is
 * bilinear in integers, then scaled to basis points, so every machine gets the same value.
 *
 * Built once per chunk: a chunk of 32 tiles with lattice spacing `s` touches `32/s + 1` corners
 * per side, so a chunk costs a few dozen hashes instead of four per tile.
 */
import { hashCell } from '../cellRandom'
import { CHUNK_SIZE } from './tileGrid'

const CORNER_BITS_DROPPED = 16
const CORNER_MAX = 0xffff
const BASIS_POINTS = 10000

export interface ChunkNoise {
  spacing: number
  cornersPerSide: number
  corners: Uint32Array
  /** The largest blended value, `CORNER_MAX * spacing^2`. */
  blendMax: number
}

/** `spacing` must divide the chunk size. */
export function chunkNoise(seed: number, cx: number, cy: number, spacing: number): ChunkNoise {
  const cornersPerSide = CHUNK_SIZE / spacing + 1
  return {
    spacing,
    cornersPerSide,
    corners: cornerValues(
      seed,
      cx * (cornersPerSide - 1),
      cy * (cornersPerSide - 1),
      cornersPerSide,
    ),
    blendMax: CORNER_MAX * spacing * spacing,
  }
}

/** Noise at a chunk-local tile, in basis points `[0, 10000]`. */
export function noiseBpAt(noise: ChunkNoise, lx: number, ly: number): number {
  return Math.floor((blendedValue(noise, lx, ly) * BASIS_POINTS) / noise.blendMax)
}

function cornerValues(seed: number, gx0: number, gy0: number, perSide: number): Uint32Array {
  const corners = new Uint32Array(perSide * perSide)
  for (let j = 0; j < perSide; j++) {
    for (let i = 0; i < perSide; i++) {
      corners[j * perSide + i] = hashCell(seed, gx0 + i, gy0 + j) >>> CORNER_BITS_DROPPED
    }
  }
  return corners
}

function blendedValue(noise: ChunkNoise, lx: number, ly: number): number {
  const { spacing, cornersPerSide, corners } = noise
  const gx = Math.floor(lx / spacing)
  const gy = Math.floor(ly / spacing)
  const fx = lx - gx * spacing
  const fy = ly - gy * spacing
  const at = gy * cornersPerSide + gx
  const bottom = corners[at] * (spacing - fx) + corners[at + 1] * fx
  const top = corners[at + cornersPerSide] * (spacing - fx) + corners[at + cornersPerSide + 1] * fx
  return bottom * (spacing - fy) + top * fy
}
