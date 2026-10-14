/**
 * Scanning a stretch of the strip's path at one tier (TD scope g on #316, ticket 341): each whole
 * metre `k` of the path reads the tile under it and one tile to each side (the bore plus its
 * sides), and the segment keeps only where what the line holds changes, empty included, so a run
 * of lava is one hit however long. It remembers the chunks it read and their edit versions, so a
 * changed delta re-reads that stretch alone (scope g 2).
 */
import { STRIP_BAND_STEPS, STRIP_SIDE_CELLS } from '../../../constants/hazardStrip'
import type { Vector2 } from '../../vehicle/localFrame'
import { CAVE_LATTICE_TILES } from '../../world/baseTerrain'
import { chunkOfTile, type TilePoint } from '../../world/tileGrid'
import type { StripGround } from './stripGround'
import {
  clearStripHit,
  createStripHit,
  isSameHit,
  joinStripHit,
  stepHitOf,
  type StepHit,
  type StripHit,
} from './stripHits'
import { writePathDirection, writePathPoint, type StripPath } from './stripPath'
import { LINE_TILES, STRIP_TIER, type StripTier } from './stripTiers'

/** A chunk a segment read, at the edit version it read. */
export interface ChunkRead {
  cx: number
  cy: number
  version: number
}

/** Steps `[from, to)` of the path, scanned at one tier. */
export interface StripSegment {
  from: number
  to: number
  tier: StripTier
  /** Where the line's hit changes, in step order; the first is at `from`. */
  hits: StepHit[]
  chunks: ChunkRead[]
}

/** Scratch for one scan, so a step allocates nothing but the hits it keeps. */
export interface ScanScratch {
  point: Vector2
  direction: Vector2
  tiles: TilePoint[]
  tileHit: StripHit
  stepHit: StripHit
  /** The last lattice blocks read (tier 3), so a block is read once while the line crosses it. */
  blockKeys: number[]
  blockKinds: number[]
  nextBlock: number
}

/** Blocks remembered: the two side by side under the line, and the two before them. */
const REMEMBERED_BLOCKS = 4
/** Chunks a segment checks before noting one again; a repeat only costs a version check. */
const RECENT_CHUNKS = 4
const BLOCK_KEY_SPAN = 1 << 21

export function createScanScratch(): ScanScratch {
  return {
    point: { x: 0, y: 0 },
    direction: { x: 0, y: 0 },
    tiles: Array.from({ length: LINE_TILES }, () => ({ tx: 0, ty: 0 })),
    tileHit: createStripHit(),
    stepHit: createStripHit(),
    blockKeys: new Array<number>(REMEMBERED_BLOCKS).fill(Number.NaN),
    blockKinds: new Array<number>(REMEMBERED_BLOCKS).fill(0),
    nextBlock: 0,
  }
}

export function scanSegment(
  ground: StripGround,
  path: StripPath,
  stretch: { from: number; to: number; tier: StripTier },
  scratch: ScanScratch,
): StripSegment {
  const segment: StripSegment = { ...stretch, hits: [], chunks: [] }
  forgetBlocks(scratch)
  if (stretch.tier === STRIP_TIER.band) scanBands(segment, ground, path, scratch)
  else scanSteps(segment, ground, path, scratch)
  return segment
}

/** Tiers 1 and 3: every metre, each of its tiles read exactly or by its lattice block. */
function scanSteps(
  segment: StripSegment,
  ground: StripGround,
  path: StripPath,
  scratch: ScanScratch,
): void {
  for (let step = segment.from; step < segment.to; step++) {
    writeLineTiles(scratch, path, step)
    readStepHit(segment, ground, scratch)
    keepChangedHit(segment, step, scratch.stepHit)
  }
}

function readStepHit(segment: StripSegment, ground: StripGround, scratch: ScanScratch): void {
  clearStripHit(scratch.stepHit)
  for (const tile of scratch.tiles) {
    noteChunkRead(segment, ground, tile)
    readTileHit(segment.tier, ground, tile, scratch)
    joinStripHit(scratch.stepHit, scratch.tileHit)
  }
}

function readTileHit(
  tier: StripTier,
  ground: StripGround,
  tile: TilePoint,
  scratch: ScanScratch,
): void {
  if (tier === STRIP_TIER.exact) {
    ground.readTile(tile, scratch.tileHit)
    return
  }
  clearStripHit(scratch.tileHit)
  scratch.tileHit.kinds = blockKindsRemembered(ground, tile, scratch)
}

function forgetBlocks(scratch: ScanScratch): void {
  scratch.blockKeys.fill(Number.NaN)
  scratch.nextBlock = 0
}

function blockKindsRemembered(ground: StripGround, tile: TilePoint, scratch: ScanScratch): number {
  const key =
    Math.floor(tile.tx / CAVE_LATTICE_TILES) * BLOCK_KEY_SPAN +
    Math.floor(tile.ty / CAVE_LATTICE_TILES)
  const at = scratch.blockKeys.indexOf(key)
  if (at >= 0) return scratch.blockKinds[at]
  const kinds = ground.blockKindsAt(tile)
  scratch.blockKeys[scratch.nextBlock] = key
  scratch.blockKinds[scratch.nextBlock] = kinds
  scratch.nextBlock = (scratch.nextBlock + 1) % REMEMBERED_BLOCKS
  return kinds
}

/**
 * Tier 4: the bands along the stretch at a fixed number of points. A change is placed where the
 * last point before it was, plus one, so a band never starts later than the strip shows it.
 */
function scanBands(
  segment: StripSegment,
  ground: StripGround,
  path: StripPath,
  scratch: ScanScratch,
): void {
  const stride = Math.max(1, Math.ceil((segment.to - segment.from) / STRIP_BAND_STEPS))
  for (let step = segment.from; step < segment.to; step += stride) {
    writeLineTiles(scratch, path, step)
    clearStripHit(scratch.stepHit)
    for (const tile of scratch.tiles) scratch.stepHit.kinds |= ground.bandKindsAt(tile)
    keepChangedHit(segment, Math.max(segment.from, step - stride + 1), scratch.stepHit)
  }
}

/** The tiles under metre `step` of the path and beside it, across the direction of travel. */
function writeLineTiles(scratch: ScanScratch, path: StripPath, step: number): void {
  const { point, direction, tiles } = scratch
  writePathPoint(path, step, point)
  writePathDirection(path, step, direction)
  for (let at = 0; at < LINE_TILES; at++) {
    const side = at - STRIP_SIDE_CELLS
    tiles[at].tx = Math.floor(point.x - direction.y * side)
    tiles[at].ty = Math.floor(point.y + direction.x * side)
  }
}

/** The first step's hit is always kept, empty or not, so the hit at any step is the last before it. */
function keepChangedHit(segment: StripSegment, step: number, hit: StripHit): void {
  const last = segment.hits[segment.hits.length - 1]
  if (last !== undefined && isSameHit(last, hit)) return
  segment.hits.push(stepHitOf(step, hit))
}

function noteChunkRead(segment: StripSegment, ground: StripGround, tile: TilePoint): void {
  const cx = chunkOfTile(tile.tx)
  const cy = chunkOfTile(tile.ty)
  if (isChunkNotedLately(segment.chunks, cx, cy)) return
  segment.chunks.push({ cx, cy, version: ground.chunkVersionOf(cx, cy) })
}

function isChunkNotedLately(chunks: readonly ChunkRead[], cx: number, cy: number): boolean {
  for (let at = chunks.length - 1; at >= Math.max(0, chunks.length - RECENT_CHUNKS); at--) {
    if (chunks[at].cx === cx && chunks[at].cy === cy) return true
  }
  return false
}
