/**
 * The seeded terrain under the placed features (decision #4 Generation): space outside the disc,
 * the core disc, caves in bands 2 to 5, and plain ground everywhere else. Every per-tile decision
 * comes from lattice noise on a per-purpose sub-seed, so a tile never depends on which chunk came
 * first. Ore is stamped over this as patches (#42, `orePatches.ts`).
 */
import { chunkNoise, noiseBpAt, noiseBpAtTile, type ChunkNoise } from './latticeNoise'
import { SEED_PURPOSE, subSeedFor } from './generatorSeeds'
import type { PlanetParams } from './planetParams'
import { bandAtHalfTileDistanceSq } from './planetGeometry'
import {
  CHUNK_CELLS,
  CHUNK_SIZE,
  firstTileOfChunk,
  halfTileDistanceSq,
  halfTileRadiusSq,
} from './tileGrid'
import { AIR_CELL, CORE_CELL, GROUND_CELL, SPACE_CELL } from './worldCell'

/** Cave lattice spacing in tiles; it divides the chunk size. Part of the generator output. */
export const CAVE_LATTICE_TILES = 8
export const FIRST_CAVE_BAND = 2

interface TerrainContext {
  params: PlanetParams
  firstTx: number
  firstTy: number
  surfaceSq: number
  coreSq: number
  caveNoise: ChunkNoise
}

export function generateBaseTerrain(params: PlanetParams, cx: number, cy: number): Uint32Array {
  const context = terrainContextOf(params, cx, cy)
  const cells = new Uint32Array(CHUNK_CELLS)
  for (let ly = 0; ly < CHUNK_SIZE; ly++) {
    for (let lx = 0; lx < CHUNK_SIZE; lx++) {
      cells[ly * CHUNK_SIZE + lx] = baseCellAt(context, lx, ly)
    }
  }
  return cells
}

/**
 * The seeded terrain at one tile, without generating its chunk: ore patches (#42) grow over the
 * plain ground around them, wherever it lies.
 */
export function baseCellOfTile(params: PlanetParams, tx: number, ty: number): number {
  const distanceSq = halfTileDistanceSq(tx, ty)
  if (distanceSq > halfTileRadiusSq(params.radiusTiles)) return SPACE_CELL
  if (distanceSq <= halfTileRadiusSq(params.coreRadiusTiles)) return CORE_CELL
  const band = bandAtHalfTileDistanceSq(params, distanceSq)
  if (band < FIRST_CAVE_BAND) return GROUND_CELL
  const noise = noiseBpAtTile(subSeedFor(params, SEED_PURPOSE.cave), CAVE_LATTICE_TILES, tx, ty)
  return noise >= params.caveThresholdBp ? AIR_CELL : GROUND_CELL
}

/** The cave noise of a chunk; the density layer reads it per sample for smooth cave walls. */
export function caveNoiseOfChunk(params: PlanetParams, cx: number, cy: number): ChunkNoise {
  return chunkNoise(subSeedFor(params, SEED_PURPOSE.cave), cx, cy, CAVE_LATTICE_TILES)
}

function terrainContextOf(params: PlanetParams, cx: number, cy: number): TerrainContext {
  return {
    params,
    firstTx: firstTileOfChunk(cx),
    firstTy: firstTileOfChunk(cy),
    surfaceSq: halfTileRadiusSq(params.radiusTiles),
    coreSq: halfTileRadiusSq(params.coreRadiusTiles),
    caveNoise: caveNoiseOfChunk(params, cx, cy),
  }
}

function baseCellAt(context: TerrainContext, lx: number, ly: number): number {
  const distanceSq = halfTileDistanceSq(context.firstTx + lx, context.firstTy + ly)
  if (distanceSq > context.surfaceSq) return SPACE_CELL
  if (distanceSq <= context.coreSq) return CORE_CELL
  const band = bandAtHalfTileDistanceSq(context.params, distanceSq)
  if (isCaveAt(context, band, lx, ly)) return AIR_CELL
  return GROUND_CELL
}

function isCaveAt(context: TerrainContext, band: number, lx: number, ly: number): boolean {
  if (band < FIRST_CAVE_BAND) return false
  return noiseBpAt(context.caveNoise, lx, ly) >= context.params.caveThresholdBp
}
