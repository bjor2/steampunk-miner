/**
 * The density layer's grid (decision #36 Model): 4 samples per metre, so a 32-tile chunk holds
 * 128x128 samples as one `Uint8Array` (0 air, 255 solid). Sample `(sx, sy)` sits at world
 * `(sx/4, sy/4)` m and takes its material from the tile that contains it, so tile `(tx, ty)` owns
 * samples `4tx..4tx+3` by `4ty..4ty+3`. A chunk's samples are indexed `lsy * 128 + lsx`.
 */
import { CHUNK_SIZE } from './tileGrid'

export const SAMPLES_PER_TILE = 4

/** Samples per chunk side. */
export const CHUNK_SAMPLE_SIDE = CHUNK_SIZE * SAMPLES_PER_TILE

/** Samples per chunk: 16 KB of density. */
export const CHUNK_SAMPLES = CHUNK_SAMPLE_SIDE * CHUNK_SAMPLE_SIDE

/** Samples per tile: a tile's yield is decided over these (#36 Yield). */
export const SAMPLES_PER_CELL = SAMPLES_PER_TILE * SAMPLES_PER_TILE

export const AIR_DENSITY = 0
export const SOLID_DENSITY = 255

/** The visible and colliding surface is the contour at this level (#36). */
export const ISO_DENSITY = 128

/** Millimetres between neighbouring samples (poses are in mm, #11). */
export const MM_PER_SAMPLE = 250

export function sampleIndexOf(lsx: number, lsy: number): number {
  return lsy * CHUNK_SAMPLE_SIDE + lsx
}

/** The chunk-local cell index of the tile that owns a chunk-local sample. */
export function cellIndexOfSample(lsx: number, lsy: number): number {
  return Math.floor(lsy / SAMPLES_PER_TILE) * CHUNK_SIZE + Math.floor(lsx / SAMPLES_PER_TILE)
}

/** The chunk a world sample coordinate falls in. */
export function chunkOfSample(sample: number): number {
  return Math.floor(sample / CHUNK_SAMPLE_SIDE)
}

export function firstSampleOfChunk(chunk: number): number {
  return chunk * CHUNK_SAMPLE_SIDE
}

/** A world sample coordinate's position inside its chunk. */
export function localSampleOf(sample: number): number {
  return sample - firstSampleOfChunk(chunkOfSample(sample))
}
