/**
 * Reading the ground as it stands now, for the client's physics (decision #36): density at any
 * world sample or, bilinearly, at any point in metres, and the material of a tile. Reads go through
 * the world's own caches; the reader keeps the last chunk it used, because a physics step reads
 * the same few chunks many times.
 */
import { SAMPLES_PER_TILE, chunkOfSample, localSampleOf, sampleIndexOf } from './sampleGrid'
import type { PlanetParams } from './planetParams'
import type { TilePoint } from './tileGrid'
import { currentDensityOfChunk, materialCellAt, type WorldState } from './worldState'

export interface GroundReader {
  densityAt(sx: number, sy: number): number
  /** The density blended between the four samples round a point in metres. */
  densityAtPoint(x: number, y: number): number
  materialAt(tile: TilePoint): number
}

export function groundReaderOf(world: WorldState, params: PlanetParams): GroundReader {
  let last: { cx: number; cy: number; density: Uint8Array } = {
    cx: Number.NaN,
    cy: Number.NaN,
    density: new Uint8Array(0),
  }
  const densityAt = (sx: number, sy: number): number => {
    const cx = chunkOfSample(sx)
    const cy = chunkOfSample(sy)
    if (cx !== last.cx || cy !== last.cy) {
      last = { cx, cy, density: currentDensityOfChunk(world, params, cx, cy) }
    }
    return last.density[sampleIndexOf(localSampleOf(sx), localSampleOf(sy))]
  }
  return {
    densityAt,
    densityAtPoint: (x, y) => blendedDensity(densityAt, x * SAMPLES_PER_TILE, y * SAMPLES_PER_TILE),
    materialAt: (tile) => materialCellAt(world, params, tile),
  }
}

function blendedDensity(densityAt: (sx: number, sy: number) => number, x: number, y: number) {
  const sx = Math.floor(x)
  const sy = Math.floor(y)
  const fx = x - sx
  const fy = y - sy
  const bottom = densityAt(sx, sy) * (1 - fx) + densityAt(sx + 1, sy) * fx
  const top = densityAt(sx, sy + 1) * (1 - fx) + densityAt(sx + 1, sy + 1) * fx
  return bottom * (1 - fy) + top * fy
}
