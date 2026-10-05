/**
 * What a collapsing block looks like (decision #43 Sequence 1, #41 casing feel: at least 1.0 s of
 * visible cracks and falling dust before any density drop): each block warning or refilling, its
 * bounds in metres and how far its telegraph has run, 0 at the warning's first tick to 1 when the
 * refill starts (and 1 while it refills). Cracks grow along a branching line seeded by the block's
 * place, one more segment as the warning runs on, so the same block always cracks the same way.
 * Presentation only: read from the authority's collapse list, written into scratch, never back.
 */
import { COLLAPSE_BLOCK_SAMPLES, COLLAPSE_WARN_TICKS } from '../../constants/balance'
import { CRACK_SEGMENT_M, CRACKS_PER_BLOCK } from '../../constants/scene'
import type { CollapseState } from '../authority/collapse/collapseState'
import { blockOfId, firstSampleOfBlock } from '../world/collapseBlock'
import { SAMPLES_PER_TILE } from '../world/sampleGrid'

/** One block's telegraph; slots are reused frame to frame. */
export interface TelegraphBlock {
  /** Lower-left corner and side, metres. */
  x0: number
  y0: number
  size: number
  /** 0 to 1. */
  progress: number
  /** The block's place as a crack seed. */
  seed: number
}

export const BLOCK_SIZE_M = COLLAPSE_BLOCK_SAMPLES / SAMPLES_PER_TILE

export function createTelegraphSlots(count: number): TelegraphBlock[] {
  return Array.from({ length: count }, () => ({ x0: 0, y0: 0, size: 0, progress: 0, seed: 0 }))
}

/** Fills `slots` with the collapsing blocks at `tick`; answers how many it filled. */
export function writeTelegraphBlocks(
  slots: TelegraphBlock[],
  collapse: CollapseState,
  tick: number,
): number {
  const count = Math.min(slots.length, collapse.blocks.length)
  for (let at = 0; at < count; at++) {
    const entry = collapse.blocks[at]
    writeSlot(slots[at], entry.block, telegraphProgress(tick - entry.startTick))
  }
  return count
}

/** How far the telegraph has run `elapsedTicks` after the warning started. */
export function telegraphProgress(elapsedTicks: number): number {
  return Math.min(1, Math.max(0, elapsedTicks / COLLAPSE_WARN_TICKS))
}

/** How many crack segments a block shows at `progress`: one at once, all by the refill. */
export function crackSegmentsAt(progress: number): number {
  return Math.max(1, Math.ceil(progress * CRACKS_PER_BLOCK))
}

/**
 * Writes the ends of crack segment `index` (0 first) of a block into `out` as
 * `[x0, y0, x1, y1]`: a walk from a seeded start inside the block, each segment turning a little
 * from the last, kept inside the block's bounds.
 */
export function writeCrackSegment(block: TelegraphBlock, index: number, out: Float32Array): void {
  let x = block.x0 + block.size * (0.25 + 0.5 * unitHash(block.seed, 0))
  let y = block.y0 + block.size * (0.25 + 0.5 * unitHash(block.seed, 1))
  let heading = 2 * Math.PI * unitHash(block.seed, 2)
  for (let step = 0; step <= index; step++) {
    heading += (unitHash(block.seed, 3 + step) - 0.5) * 1.6
    out[0] = x
    out[1] = y
    x = clampInto(x + Math.cos(heading) * CRACK_SEGMENT_M, block.x0, block.size)
    y = clampInto(y + Math.sin(heading) * CRACK_SEGMENT_M, block.y0, block.size)
    out[2] = x
    out[3] = y
  }
}

function writeSlot(slot: TelegraphBlock, id: string, progress: number): void {
  const block = blockOfId(id)
  if (block === null) return
  const first = firstSampleOfBlock(block)
  slot.x0 = first.sx / SAMPLES_PER_TILE
  slot.y0 = first.sy / SAMPLES_PER_TILE
  slot.size = BLOCK_SIZE_M
  slot.progress = progress
  slot.seed = (first.sx * 73856093) ^ (first.sy * 19349663)
}

function clampInto(value: number, from: number, size: number): number {
  return Math.min(from + size, Math.max(from, value))
}

/** A float in [0, 1) from a seed and a salt: an integer hash, the same on every frame. */
function unitHash(seed: number, salt: number): number {
  let h = (seed ^ Math.imul(salt + 1, 0x9e3779b1)) >>> 0
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b) >>> 0
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0
  return ((h ^ (h >>> 16)) >>> 0) / 0x100000000
}
