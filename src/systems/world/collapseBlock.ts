/**
 * Collapse blocks (decision #43 Rule): the 4x4 m collision blocks of #36, 16x16 density samples,
 * eight to a chunk side. A block is named `cx,cy#index` with `index = by * 8 + bx` inside its chunk,
 * and blocks are always processed in `chunkKey`, then block-index order, so every machine sees the
 * same sequence. Integer arithmetic only: positions in mm, distances squared.
 */
import { COLLAPSE_BLOCK_SAMPLES } from '../../constants/balance'
import { CHUNK_SAMPLE_SIDE, MM_PER_SAMPLE } from './sampleGrid'
import { chunkKey } from './tileGrid'

export interface CollapseBlock {
  cx: number
  cy: number
  /** `by * 8 + bx` inside the chunk. */
  index: number
}

/** Blocks per chunk side. */
const BLOCKS_PER_CHUNK_SIDE = CHUNK_SAMPLE_SIDE / COLLAPSE_BLOCK_SAMPLES
const BLOCK_MM = COLLAPSE_BLOCK_SAMPLES * MM_PER_SAMPLE
const BLOCK_ID_PATTERN = /^(-?\d+),(-?\d+)#(\d+)$/

export function blockIdOf(block: CollapseBlock): string {
  return `${chunkKey(block.cx, block.cy)}#${block.index}`
}

/** The block a `cx,cy#index` id names, or null when the id is not one. */
export function blockOfId(id: string): CollapseBlock | null {
  const match = BLOCK_ID_PATTERN.exec(id)
  if (match === null) return null
  const [cx, cy, index] = match.slice(1).map((part) => Number.parseInt(part, 10))
  if (index >= BLOCKS_PER_CHUNK_SIDE * BLOCKS_PER_CHUNK_SIDE) return null
  return { cx, cy, index }
}

/** The world sample at the block's lower-left corner. */
export function firstSampleOfBlock(block: CollapseBlock): { sx: number; sy: number } {
  const bx = block.index % BLOCKS_PER_CHUNK_SIDE
  const by = Math.floor(block.index / BLOCKS_PER_CHUNK_SIDE)
  return {
    sx: block.cx * CHUNK_SAMPLE_SIDE + bx * COLLAPSE_BLOCK_SAMPLES,
    sy: block.cy * CHUNK_SAMPLE_SIDE + by * COLLAPSE_BLOCK_SAMPLES,
  }
}

/** The block's 256 world samples in row order. */
export function samplesOfBlock(block: CollapseBlock): { sx: number; sy: number }[] {
  const first = firstSampleOfBlock(block)
  return Array.from({ length: COLLAPSE_BLOCK_SAMPLES * COLLAPSE_BLOCK_SAMPLES }, (_, at) => ({
    sx: first.sx + (at % COLLAPSE_BLOCK_SAMPLES),
    sy: first.sy + Math.floor(at / COLLAPSE_BLOCK_SAMPLES),
  }))
}

export function isSampleInBlock(block: CollapseBlock, sx: number, sy: number): boolean {
  const first = firstSampleOfBlock(block)
  return (
    sx >= first.sx &&
    sy >= first.sy &&
    sx < first.sx + COLLAPSE_BLOCK_SAMPLES &&
    sy < first.sy + COLLAPSE_BLOCK_SAMPLES
  )
}

export function blockCentreMm(block: CollapseBlock): { xMm: number; yMm: number } {
  const first = firstSampleOfBlock(block)
  const half = COLLAPSE_BLOCK_SAMPLES / 2
  return { xMm: (first.sx + half) * MM_PER_SAMPLE, yMm: (first.sy + half) * MM_PER_SAMPLE }
}

export function isBlockCentreWithin(
  block: CollapseBlock,
  point: { xMm: number; yMm: number },
  radiusMm: number,
): boolean {
  const centre = blockCentreMm(block)
  const dx = centre.xMm - point.xMm
  const dy = centre.yMm - point.yMm
  return dx * dx + dy * dy <= radiusMm * radiusMm
}

/** Every block whose centre lies within `radiusMm` of the point, in processing order. */
export function blocksNear(point: { xMm: number; yMm: number }, radiusMm: number): CollapseBlock[] {
  const blocks: CollapseBlock[] = []
  const [x0, x1] = [blockColumnOf(point.xMm - radiusMm), blockColumnOf(point.xMm + radiusMm)]
  const [y0, y1] = [blockColumnOf(point.yMm - radiusMm), blockColumnOf(point.yMm + radiusMm)]
  for (let gby = y0; gby <= y1; gby++) {
    for (let gbx = x0; gbx <= x1; gbx++) blocks.push(blockOfWorldBlock(gbx, gby))
  }
  return sortBlocks(blocks.filter((block) => isBlockCentreWithin(block, point, radiusMm)))
}

/** The block holding a point in mm. */
export function blockContaining(point: { xMm: number; yMm: number }): CollapseBlock {
  return blockOfWorldBlock(blockColumnOf(point.xMm), blockColumnOf(point.yMm))
}

/** Blocks in processing order: `chunkKey`, then block index (#43 Sequence). */
export function sortBlocks(blocks: readonly CollapseBlock[]): CollapseBlock[] {
  return [...blocks].sort(compareBlocks)
}

export function compareBlocks(a: CollapseBlock, b: CollapseBlock): number {
  const [keyA, keyB] = [chunkKey(a.cx, a.cy), chunkKey(b.cx, b.cy)]
  if (keyA !== keyB) return keyA < keyB ? -1 : 1
  return a.index - b.index
}

export function isSameBlock(a: CollapseBlock, b: CollapseBlock): boolean {
  return a.cx === b.cx && a.cy === b.cy && a.index === b.index
}

function blockColumnOf(mm: number): number {
  return Math.floor(mm / BLOCK_MM)
}

function blockOfWorldBlock(gbx: number, gby: number): CollapseBlock {
  const cx = Math.floor(gbx / BLOCKS_PER_CHUNK_SIDE)
  const cy = Math.floor(gby / BLOCKS_PER_CHUNK_SIDE)
  const bx = gbx - cx * BLOCKS_PER_CHUNK_SIDE
  const by = gby - cy * BLOCKS_PER_CHUNK_SIDE
  return { cx, cy, index: by * BLOCKS_PER_CHUNK_SIDE + bx }
}
