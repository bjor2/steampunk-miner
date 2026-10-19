/**
 * A chunk's density halo for the renderer (#36 Rendering): its own 128 x 128 samples plus the
 * first column of its right neighbour, the first row of the one above and their shared corner,
 * so the squares along the chunk's right and top edges blend into the next chunk without a seam.
 * Row-major, `DENSITY_HALO_SIDE` wide; the shader samples it as a texture.
 */
import { CHUNK_SAMPLE_SIDE, sampleIndexOf } from '../world/sampleGrid'
import type { ChunkPoint } from './visibleChunks'

export const DENSITY_HALO_SIDE = CHUNK_SAMPLE_SIDE + 1

/**
 * Whether a halo built earlier still holds its neighbours' edge samples (ticket 330): an edit
 * inside a neighbour, away from its first column and row, leaves this chunk's view as it was, so
 * only the edited chunk needs a new mesh.
 */
export function isHaloEdgeCurrent(
  halo: Uint8Array,
  densityOf: ChunkDensity,
  cx: number,
  cy: number,
): boolean {
  return (
    isRightEdgeCurrent(halo, densityOf(cx + 1, cy)) &&
    isTopEdgeCurrent(halo, densityOf(cx, cy + 1)) &&
    isCornerCurrent(halo, densityOf(cx + 1, cy + 1))
  )
}

/** The halo's last column still holds the right neighbour's first one. */
export function isRightEdgeCurrent(halo: Uint8Array, right: Uint8Array): boolean {
  for (let lsy = 0; lsy < CHUNK_SAMPLE_SIDE; lsy++) {
    if (halo[lsy * DENSITY_HALO_SIDE + CHUNK_SAMPLE_SIDE] !== right[sampleIndexOf(0, lsy)])
      return false
  }
  return true
}

/** The halo's top row still holds the upper neighbour's first one. */
export function isTopEdgeCurrent(halo: Uint8Array, above: Uint8Array): boolean {
  const top = CHUNK_SAMPLE_SIDE * DENSITY_HALO_SIDE
  for (let lsx = 0; lsx < CHUNK_SAMPLE_SIDE; lsx++) {
    if (halo[top + lsx] !== above[lsx]) return false
  }
  return true
}

/** The halo's corner still holds the upper-right neighbour's first sample. */
export function isCornerCurrent(halo: Uint8Array, corner: Uint8Array): boolean {
  return halo[CHUNK_SAMPLE_SIDE * DENSITY_HALO_SIDE + CHUNK_SAMPLE_SIDE] === corner[0]
}

/**
 * The chunks whose density a halo reads: its own, the right, the upper and the upper-right one.
 * Generating them ahead keeps a cold chunk's generation out of its mesh build (ticket 336).
 */
export function haloChunksOf(cx: number, cy: number): ChunkPoint[] {
  return [
    { cx, cy },
    { cx: cx + 1, cy },
    { cx, cy: cy + 1 },
    { cx: cx + 1, cy: cy + 1 },
  ]
}

/** The current density of any chunk; callers only read it. */
export type ChunkDensity = (cx: number, cy: number) => Uint8Array

export function chunkDensityHaloOf(
  densityOf: ChunkDensity,
  cx: number,
  cy: number,
): Uint8Array<ArrayBuffer> {
  const halo = new Uint8Array(DENSITY_HALO_SIDE * DENSITY_HALO_SIDE)
  writeOwnSamples(halo, densityOf(cx, cy))
  writeRightEdge(halo, densityOf(cx + 1, cy))
  writeTopEdge(halo, densityOf(cx, cy + 1))
  writeCorner(halo, densityOf(cx + 1, cy + 1))
  return halo
}

/** The chunk's own samples written into its halo, in place. */
export function writeOwnSamples(halo: Uint8Array, own: Uint8Array): void {
  for (let lsy = 0; lsy < CHUNK_SAMPLE_SIDE; lsy++) {
    const from = lsy * CHUNK_SAMPLE_SIDE
    halo.set(own.subarray(from, from + CHUNK_SAMPLE_SIDE), lsy * DENSITY_HALO_SIDE)
  }
}

/** The right neighbour's first column written into the halo's last one, in place. */
export function writeRightEdge(halo: Uint8Array, right: Uint8Array): void {
  for (let lsy = 0; lsy < CHUNK_SAMPLE_SIDE; lsy++) {
    halo[lsy * DENSITY_HALO_SIDE + CHUNK_SAMPLE_SIDE] = right[sampleIndexOf(0, lsy)]
  }
}

/** The upper neighbour's first row written into the halo's top one, in place. */
export function writeTopEdge(halo: Uint8Array, above: Uint8Array): void {
  halo.set(above.subarray(0, CHUNK_SAMPLE_SIDE), CHUNK_SAMPLE_SIDE * DENSITY_HALO_SIDE)
}

/** The upper-right neighbour's first sample written into the halo's corner, in place. */
export function writeCorner(halo: Uint8Array, corner: Uint8Array): void {
  halo[CHUNK_SAMPLE_SIDE * DENSITY_HALO_SIDE + CHUNK_SAMPLE_SIDE] = corner[0]
}
