/**
 * Which collapse blocks are weak (decision #43 Rule, as amended by the Game Director on #57, Q1
 * Option A, and the Technical Director's build note 1):
 *
 *   a 4x4 m block is weak if any solid sample bordering its carved air (an 8-neighbour) holds
 *   lining with 0 < casing < required, where required is the grade the sample's band needs (5 in
 *   the core). Unlined walls (casing 0) are ignored, so the unlined face and the last ~2.15 m behind
 *   the drill never make a block weak, and carving a lined sample clears it from the test.
 *
 * Weakness is a pure function of the ground, so it is cached per block and recomputed only when
 * one of the chunk deltas it reads changes (a `GroundChanged` touched the block or its border).
 */
import { requiredCasingGrade } from '../economy/casingGrades'
import { ECONOMY } from '../economy/economy'
import { blockIdOf, samplesOfBlock, type CollapseBlock } from './collapseBlock'
import { COLLAPSE_BLOCK_SAMPLES } from '../../constants/balance'
import type { ChunkDelta } from './chunkDelta'
import { bandOfTile, isCoreTile } from './planetGeometry'
import type { PlanetParams } from './planetParams'
import { chunkOfSample, SAMPLES_PER_TILE } from './sampleGrid'
import {
  casingAt,
  isCarvedAirAt,
  isSolidAt,
  openSampleLayers,
  type SampleLayers,
} from './sampleLayers'
import { deltaOfChunk, type WorldState } from './worldState'

/** What `collapse_warning` reports: the weakest lining's grade and the band it sits in. */
export interface BlockWeakness {
  band: number
  weakestGrade: number
  required: number
}

/** A world density sample. */
export interface SamplePoint {
  sx: number
  sy: number
}

/** The band whose grade a tile needs: its own, or the core's band (6, #6) inside the core. */
export function casingBandOfTile(params: PlanetParams, tx: number, ty: number): number {
  return isCoreTile(params, tx, ty) ? ECONOMY.ore.coreTierBand : bandOfTile(params, tx, ty)
}

export function weaknessOfBlock(
  world: WorldState,
  params: PlanetParams,
  block: CollapseBlock,
): BlockWeakness | null {
  const deps = deltasReadBy(world, block)
  const key = cacheKeyOf(params, block)
  const cached = weaknessCache.get(key)
  if (cached !== undefined && isSameDeltas(cached.deps, deps)) return cached.weakness
  const weakness = deps.some(hasCasing) ? findWeakness(world, params, block) : null
  rememberWeakness(key, { deps, weakness })
  return weakness
}

/** Every lined solid sample bordering the block's carved air, once each, in row order. */
export function linedWallsOfBlock(layers: SampleLayers, block: CollapseBlock): SamplePoint[] {
  const walls = new Map<string, SamplePoint>()
  for (const air of samplesOfBlock(block)) {
    if (!isCarvedAirAt(layers, air.sx, air.sy)) continue
    for (const wall of eightNeighboursOf(air)) {
      if (isLinedWall(layers, wall)) walls.set(`${wall.sx},${wall.sy}`, wall)
    }
  }
  return [...walls.values()]
}

function findWeakness(
  world: WorldState,
  params: PlanetParams,
  block: CollapseBlock,
): BlockWeakness | null {
  const layers = openSampleLayers(world, params)
  return linedWallsOfBlock(layers, block)
    .map((wall) => wallWeaknessOf(layers, params, wall))
    .reduce<BlockWeakness | null>(weaker, null)
}

function wallWeaknessOf(
  layers: SampleLayers,
  params: PlanetParams,
  wall: SamplePoint,
): BlockWeakness | null {
  const band = casingBandOfTile(params, tileOf(wall.sx), tileOf(wall.sy))
  const required = requiredCasingGrade(band)
  const grade = casingAt(layers, wall.sx, wall.sy)
  return grade < required ? { band, weakestGrade: grade, required } : null
}

/** The lower grade wins; on a tie the first in row order stays. */
function weaker(kept: BlockWeakness | null, next: BlockWeakness | null): BlockWeakness | null {
  if (next === null) return kept
  if (kept === null || next.weakestGrade < kept.weakestGrade) return next
  return kept
}

function isLinedWall(layers: SampleLayers, sample: SamplePoint): boolean {
  return isSolidAt(layers, sample.sx, sample.sy) && casingAt(layers, sample.sx, sample.sy) > 0
}

const NEIGHBOUR_OFFSETS: readonly (readonly [number, number])[] = [
  [-1, -1],
  [0, -1],
  [1, -1],
  [-1, 0],
  [1, 0],
  [-1, 1],
  [0, 1],
  [1, 1],
]

export function eightNeighboursOf(sample: SamplePoint): SamplePoint[] {
  return NEIGHBOUR_OFFSETS.map(([dx, dy]) => ({ sx: sample.sx + dx, sy: sample.sy + dy }))
}

function tileOf(sample: number): number {
  return Math.floor(sample / SAMPLES_PER_TILE)
}

interface CachedWeakness {
  deps: readonly ChunkDelta[]
  weakness: BlockWeakness | null
}

/** Enough for every block round a few vehicles; past it the cache starts over. */
const MAX_CACHED_BLOCKS = 4096
const weaknessCache = new Map<string, CachedWeakness>()

function rememberWeakness(key: string, entry: CachedWeakness): void {
  if (weaknessCache.size >= MAX_CACHED_BLOCKS) weaknessCache.clear()
  weaknessCache.set(key, entry)
}

function cacheKeyOf(params: PlanetParams, block: CollapseBlock): string {
  return `${params.worldSeed}:${params.planetIndex}:${blockIdOf(block)}`
}

/** The deltas of the chunks under the block and its one-sample border, in a fixed order. */
function deltasReadBy(world: WorldState, block: CollapseBlock): ChunkDelta[] {
  const [first] = samplesOfBlock(block)
  const columns = chunkSpanOf(first.sx)
  const rows = chunkSpanOf(first.sy)
  return rows.flatMap((cy) => columns.map((cx) => deltaOfChunk(world, cx, cy)))
}

/** A block is an eighth of a chunk, so its border reaches at most one neighbouring chunk. */
function chunkSpanOf(firstSample: number): number[] {
  const low = chunkOfSample(firstSample - 1)
  const high = chunkOfSample(firstSample + COLLAPSE_BLOCK_SAMPLES)
  return low === high ? [low] : [low, high]
}

function isSameDeltas(a: readonly ChunkDelta[], b: readonly ChunkDelta[]): boolean {
  return a.length === b.length && a.every((delta, at) => delta === b[at])
}

function hasCasing(delta: ChunkDelta): boolean {
  return delta.casing.length > 0
}
