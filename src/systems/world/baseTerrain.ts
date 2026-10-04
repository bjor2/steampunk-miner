/**
 * The seeded terrain under the placed features (decision #4 Generation): space outside the disc,
 * the core disc, caves in bands 2 to 5, ore clustered by value noise at the #6 density for its
 * band, and plain ground everywhere else. Every per-tile decision comes from `cellRandom` and
 * lattice noise on per-purpose sub-seeds, so a tile never depends on which chunk came first.
 *
 * Ore chance per tile is `density * 2 * clusterNoise`: the noise averages one half, so the band
 * keeps its #6 density on average while ore gathers into veins.
 */
import { cellRandomFloat, hashCell } from '../cellRandom'
import { chunkNoise, noiseBpAt, type ChunkNoise } from './latticeNoise'
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
import {
  AIR_CELL,
  CORE_CELL,
  GROUND_CELL,
  oreCell,
  RESOURCE_FAMILY,
  SPACE_CELL,
  type ResourceFamily,
} from './worldCell'

/** Lattice spacings in tiles; each divides the chunk size. Part of the generator output. */
const CAVE_LATTICE_TILES = 8
const ORE_CLUSTER_LATTICE_TILES = 4
const ORE_FAMILY_REGION_TILES = 8
/** `random < densityBp/10^4 * 2 * noiseBp/10^4`, scaled to compare in whole basis points. */
const ORE_ROLL_SCALE = 50_000_000
const FIRST_CAVE_BAND = 2

interface TerrainContext {
  params: PlanetParams
  firstTx: number
  firstTy: number
  surfaceSq: number
  coreSq: number
  caveNoise: ChunkNoise
  oreClusterNoise: ChunkNoise
  oreSeed: number
  oreFamilySeed: number
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

function terrainContextOf(params: PlanetParams, cx: number, cy: number): TerrainContext {
  return {
    params,
    firstTx: firstTileOfChunk(cx),
    firstTy: firstTileOfChunk(cy),
    surfaceSq: halfTileRadiusSq(params.radiusTiles),
    coreSq: halfTileRadiusSq(params.coreRadiusTiles),
    caveNoise: chunkNoise(subSeedFor(params, SEED_PURPOSE.cave), cx, cy, CAVE_LATTICE_TILES),
    oreClusterNoise: chunkNoise(
      subSeedFor(params, SEED_PURPOSE.oreCluster),
      cx,
      cy,
      ORE_CLUSTER_LATTICE_TILES,
    ),
    oreSeed: subSeedFor(params, SEED_PURPOSE.ore),
    oreFamilySeed: subSeedFor(params, SEED_PURPOSE.oreFamily),
  }
}

function baseCellAt(context: TerrainContext, lx: number, ly: number): number {
  const tx = context.firstTx + lx
  const ty = context.firstTy + ly
  const distanceSq = halfTileDistanceSq(tx, ty)
  if (distanceSq > context.surfaceSq) return SPACE_CELL
  if (distanceSq <= context.coreSq) return CORE_CELL
  const band = bandAtHalfTileDistanceSq(context.params, distanceSq)
  if (isCaveAt(context, band, lx, ly)) return AIR_CELL
  if (isOreAt(context, band, tx, ty, lx, ly)) return oreCell(oreFamilyAt(context, tx, ty), band - 1)
  return GROUND_CELL
}

function isCaveAt(context: TerrainContext, band: number, lx: number, ly: number): boolean {
  if (band < FIRST_CAVE_BAND) return false
  return noiseBpAt(context.caveNoise, lx, ly) >= context.params.caveThresholdBp
}

function isOreAt(
  context: TerrainContext,
  band: number,
  tx: number,
  ty: number,
  lx: number,
  ly: number,
): boolean {
  const chanceScaled =
    context.params.oreDensityBp[band - 1] * noiseBpAt(context.oreClusterNoise, lx, ly)
  return cellRandomFloat(context.oreSeed, tx, ty) * ORE_ROLL_SCALE < chanceScaled
}

/** One family per 8x8 region, picked by the planet's family weights, so a vein is one material. */
function oreFamilyAt(context: TerrainContext, tx: number, ty: number): ResourceFamily {
  const { metal, crystal } = context.params.familyWeights
  const regionHash = hashCell(
    context.oreFamilySeed,
    Math.floor(tx / ORE_FAMILY_REGION_TILES),
    Math.floor(ty / ORE_FAMILY_REGION_TILES),
  )
  return regionHash % (metal + crystal) < metal ? RESOURCE_FAMILY.metal : RESOURCE_FAMILY.crystal
}
