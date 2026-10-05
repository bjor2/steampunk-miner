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
  return Math.floor((blendedValue(noise, lx, ly, 1) * BASIS_POINTS) / noise.blendMax)
}

/**
 * The same noise at a chunk-local density sample (#36: cave edges come from the same lattice
 * noise), `steps` samples per tile. At a tile's own corner sample it equals `noiseBpAt` exactly.
 */
export function noiseBpAtSample(
  noise: ChunkNoise,
  lsx: number,
  lsy: number,
  steps: number,
): number {
  const blendMax = noise.blendMax * steps * steps
  return Math.floor((blendedValue(noise, lsx, lsy, steps) * BASIS_POINTS) / blendMax)
}

/**
 * The noise at one world tile without building a chunk's corners: the same corner hashes and
 * blend as `noiseBpAt`, so it answers the same value for the same tile.
 */
export function noiseBpAtTile(seed: number, spacing: number, tx: number, ty: number): number {
  const gx = Math.floor(tx / spacing)
  const gy = Math.floor(ty / spacing)
  const noise: ChunkNoise = {
    spacing,
    cornersPerSide: 2,
    corners: cornerValues(seed, gx, gy, 2),
    blendMax: CORNER_MAX * spacing * spacing,
  }
  return noiseBpAt(noise, tx - gx * spacing, ty - gy * spacing)
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

/** Bilinear blend at `(x, y)` in units of `1/steps` tile, scaled by `(spacing * steps)^2`. */
function blendedValue(noise: ChunkNoise, x: number, y: number, steps: number): number {
  const { cornersPerSide, corners } = noise
  const spacing = noise.spacing * steps
  const gx = Math.floor(x / spacing)
  const gy = Math.floor(y / spacing)
  const fx = x - gx * spacing
  const fy = y - gy * spacing
  const at = gy * cornersPerSide + gx
  const bottom = corners[at] * (spacing - fx) + corners[at + 1] * fx
  const top = corners[at + cornersPerSide] * (spacing - fx) + corners[at + cornersPerSide + 1] * fx
  return bottom * (spacing - fy) + top * fy
}
