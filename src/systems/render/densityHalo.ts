/**
 * A chunk's density halo for the renderer (#36 Rendering): its own 128 x 128 samples plus the
 * first column of its right neighbour, the first row of the one above and their shared corner,
 * so the squares along the chunk's right and top edges blend into the next chunk without a seam.
 * Row-major, `DENSITY_HALO_SIDE` wide; the shader samples it as a texture.
 */
import { CHUNK_SAMPLE_SIDE, sampleIndexOf } from '../world/sampleGrid'

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
  const right = densityOf(cx + 1, cy)
  const above = densityOf(cx, cy + 1)
  const top = CHUNK_SAMPLE_SIDE * DENSITY_HALO_SIDE
  for (let lsy = 0; lsy < CHUNK_SAMPLE_SIDE; lsy++) {
    if (halo[lsy * DENSITY_HALO_SIDE + CHUNK_SAMPLE_SIDE] !== right[sampleIndexOf(0, lsy)])
      return false
  }
  for (let lsx = 0; lsx < CHUNK_SAMPLE_SIDE; lsx++) {
    if (halo[top + lsx] !== above[lsx]) return false
  }
  return halo[top + CHUNK_SAMPLE_SIDE] === densityOf(cx + 1, cy + 1)[0]
}

/** The current density of any chunk; callers only read it. */
export type ChunkDensity = (cx: number, cy: number) => Uint8Array

export function chunkDensityHaloOf(
  densityOf: ChunkDensity,
  cx: number,
  cy: number,
): Uint8Array<ArrayBuffer> {
  const halo = new Uint8Array(DENSITY_HALO_SIDE * DENSITY_HALO_SIDE)
  const own = densityOf(cx, cy)
  const right = densityOf(cx + 1, cy)
  const above = densityOf(cx, cy + 1)
  for (let lsy = 0; lsy < CHUNK_SAMPLE_SIDE; lsy++) {
    const row = lsy * DENSITY_HALO_SIDE
    halo.set(own.subarray(lsy * CHUNK_SAMPLE_SIDE, (lsy + 1) * CHUNK_SAMPLE_SIDE), row)
    halo[row + CHUNK_SAMPLE_SIDE] = right[sampleIndexOf(0, lsy)]
  }
  const top = CHUNK_SAMPLE_SIDE * DENSITY_HALO_SIDE
  halo.set(above.subarray(0, CHUNK_SAMPLE_SIDE), top)
  halo[top + CHUNK_SAMPLE_SIDE] = densityOf(cx + 1, cy + 1)[0]
  return halo
}
