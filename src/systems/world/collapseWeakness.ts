/**
 * Which collapse blocks are weak (decision #43 Rule, as amended by the Game Director on #57, Q1
 * Option A, and the Technical Director's build note 1):
 *
 *   a 4x4 m block is weak if any solid sample bordering its carved air (an 8-neighbour) holds
 *   lining with 0 < casing < required, where required is the grade the sample's band needs (5 in
 *   the core). Unlined walls (casing 0) are ignored, so the unlined face and the last ~2.15 m behind
 *   the drill never make a block weak, and carving a lined sample clears it from the test.
 *
 * Breached lining (#111) is lined at an effective grade of 0, so it is weak in every band, while
 * never-lined rock stays ignored.
 *
 * Weakness is a pure function of the ground, so it is cached per block and recomputed only when
 * the ground it reads changed: a new delta of a chunk under the block or its border that holds other
 * density or casing over those samples (`collapseBlockGround`, #120).
 */
import { requiredCasingGrade } from '../economy/casingGrades'
import { blockIdOf, firstSampleOfBlock, type CollapseBlock } from './collapseBlock'
import {
  chunksReadByBlock,
  deltasReadByBlock,
  isSameGroundReadByBlock,
} from './collapseBlockGround'
import { COLLAPSE_BLOCK_SAMPLES } from '../../constants/balance'
import { effectiveCasingGrade, isLined, type ChunkDelta } from './chunkDelta'
import { casingBandOfTile } from './casingBand'
import type { PlanetParams } from './planetParams'
import { SAMPLES_PER_TILE } from './sampleGrid'
import {
  casingAt,
  isCarvedAirAt,
  isSolidAt,
  openSampleLayers,
  type SampleLayers,
} from './sampleLayers'
import type { WorldState } from './worldState'

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

export function weaknessOfBlock(
  world: WorldState,
  params: PlanetParams,
  block: CollapseBlock,
): BlockWeakness | null {
  const chunks = chunksReadByBlock(block)
  const deps = deltasReadByBlock(world, chunks)
  const key = cacheKeyOf(params, block)
  const cached = weaknessCache.get(key)
  if (cached !== undefined && isSameGroundReadByBlock(params, block, chunks, cached.deps, deps)) {
    return keepWeakness(key, cached, deps)
  }
  const weakness = deps.some(hasCasing) ? findWeakness(world, params, block) : null
  rememberWeakness(key, { deps, weakness })
  return weakness
}

/** Every lined solid sample bordering the block's carved air, once each, in row order. */
export function linedWallsOfBlock(layers: SampleLayers, block: CollapseBlock): SamplePoint[] {
  const walls = new Map<string, SamplePoint>()
  visitLinedWallsOfBlock(layers, block, (sx, sy) => walls.set(`${sx},${sy}`, { sx, sy }))
  return [...walls.values()]
}

/**
 * The weakest wall in the order `linedWallsOfBlock` lists them. Walks the samples in place: this
 * runs for every block near a vehicle whose ground changed, on every carve (#120).
 */
function findWeakness(
  world: WorldState,
  params: PlanetParams,
  block: CollapseBlock,
): BlockWeakness | null {
  const layers = openSampleLayers(world, params)
  let weakest: BlockWeakness | null = null
  visitLinedWallsOfBlock(layers, block, (sx, sy) => {
    weakest = weakerWall(weakest, layers, params, sx, sy)
  })
  return weakest
}

/**
 * Each lined solid sample bordering the block's carved air, met air sample by air sample in row
 * order, neighbours in `NEIGHBOUR_OFFSETS` order; a wall bordering several air samples comes again.
 */
function visitLinedWallsOfBlock(
  layers: SampleLayers,
  block: CollapseBlock,
  visit: (sx: number, sy: number) => void,
): void {
  const first = firstSampleOfBlock(block)
  for (let sy = first.sy; sy < first.sy + COLLAPSE_BLOCK_SAMPLES; sy++) {
    for (let sx = first.sx; sx < first.sx + COLLAPSE_BLOCK_SAMPLES; sx++) {
      if (isCarvedAirAt(layers, sx, sy)) visitLinedNeighbours(layers, sx, sy, visit)
    }
  }
}

function visitLinedNeighbours(
  layers: SampleLayers,
  sx: number,
  sy: number,
  visit: (sx: number, sy: number) => void,
): void {
  for (const [dx, dy] of NEIGHBOUR_OFFSETS) {
    if (isLinedWall(layers, sx + dx, sy + dy)) visit(sx + dx, sy + dy)
  }
}

/**
 * `kept`, or the wall when it is weak and lower in grade: the lower grade wins, on a tie the first
 * met stays, so a wall met again never changes the answer. The band is read only when the wall's
 * grade could win.
 */
function weakerWall(
  kept: BlockWeakness | null,
  layers: SampleLayers,
  params: PlanetParams,
  sx: number,
  sy: number,
): BlockWeakness | null {
  const grade = effectiveCasingGrade(casingAt(layers, sx, sy))
  if (kept !== null && grade >= kept.weakestGrade) return kept
  const band = casingBandOfTile(params, tileOf(sx), tileOf(sy))
  const required = requiredCasingGrade(band)
  return grade < required ? { band, weakestGrade: grade, required } : kept
}

function isLinedWall(layers: SampleLayers, sx: number, sy: number): boolean {
  return isSolidAt(layers, sx, sy) && isLined(casingAt(layers, sx, sy))
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

/** The ground the block reads is unchanged: its weakness stands, now against the new deltas. */
function keepWeakness(
  key: string,
  cached: CachedWeakness,
  deps: readonly ChunkDelta[],
): BlockWeakness | null {
  weaknessCache.set(key, { deps, weakness: cached.weakness })
  return cached.weakness
}

function rememberWeakness(key: string, entry: CachedWeakness): void {
  if (weaknessCache.size >= MAX_CACHED_BLOCKS) weaknessCache.clear()
  weaknessCache.set(key, entry)
}

function cacheKeyOf(params: PlanetParams, block: CollapseBlock): string {
  return `${params.worldSeed}:${params.planetIndex}:${blockIdOf(block)}`
}

function hasCasing(delta: ChunkDelta): boolean {
  return delta.casing.length > 0
}
