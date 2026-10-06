/**
 * The ground a collapse block's weakness reads (decision #43 Rule): the density, generated density
 * and casing of the block's 16 x 16 samples and their one-sample border, which can reach into the
 * neighbouring chunks. Weakness is a pure function of those bytes, so a block whose bytes did not
 * change keeps its weakness even when a carve elsewhere gave its chunk a new delta (#120: during
 * continuous drilling every block within 16 m shares the chunk the drill is cutting).
 */
import { COLLAPSE_BLOCK_SAMPLES } from '../../constants/balance'
import type { ChunkDelta } from './chunkDelta'
import { firstSampleOfBlock, type CollapseBlock } from './collapseBlock'
import type { PlanetParams } from './planetParams'
import { CHUNK_SAMPLE_SIDE, chunkOfSample, sampleIndexOf } from './sampleGrid'
import {
  casingOfChunkDelta,
  deltaOfChunk,
  densityOfChunkDelta,
  type WorldState,
} from './worldState'

/** A chunk the block reads, by its position. */
export interface ChunkPosition {
  cx: number
  cy: number
}

/** The samples the block reads, inclusive, in world samples. */
interface SampleSpan {
  sx0: number
  sy0: number
  sx1: number
  sy1: number
}

/** The chunks under the block and its one-sample border, rows then columns. */
export function chunksReadByBlock(block: CollapseBlock): ChunkPosition[] {
  const span = sampleSpanOf(block)
  const columns = chunkSpanOf(span.sx0, span.sx1)
  return chunkSpanOf(span.sy0, span.sy1).flatMap((cy) => columns.map((cx) => ({ cx, cy })))
}

/** The deltas of `chunksReadByBlock`, in the same order. */
export function deltasReadByBlock(
  world: WorldState,
  chunks: readonly ChunkPosition[],
): ChunkDelta[] {
  return chunks.map(({ cx, cy }) => deltaOfChunk(world, cx, cy))
}

/**
 * Whether two sets of deltas of `chunks` hold the same density and casing over every sample the
 * block reads. The generated density is the planet's, the same for both.
 */
export function isSameGroundReadByBlock(
  params: PlanetParams,
  block: CollapseBlock,
  chunks: readonly ChunkPosition[],
  before: readonly ChunkDelta[],
  after: readonly ChunkDelta[],
): boolean {
  const span = sampleSpanOf(block)
  return chunks.every(
    (chunk, at) =>
      before[at] === after[at] || isSameChunkGround(params, chunk, span, before[at], after[at]),
  )
}

function isSameChunkGround(
  params: PlanetParams,
  { cx, cy }: ChunkPosition,
  span: SampleSpan,
  before: ChunkDelta,
  after: ChunkDelta,
): boolean {
  const inChunk = localSpanOf(span, cx, cy)
  return (
    isSameLayerIn(
      densityOfChunkDelta(params, cx, cy, before),
      densityOfChunkDelta(params, cx, cy, after),
      inChunk,
    ) && isSameLayerIn(casingOfChunkDelta(before), casingOfChunkDelta(after), inChunk)
  )
}

function isSameLayerIn(a: Uint8Array, b: Uint8Array, span: SampleSpan): boolean {
  if (a === b) return true
  for (let lsy = span.sy0; lsy <= span.sy1; lsy++) {
    const [first, last] = [sampleIndexOf(span.sx0, lsy), sampleIndexOf(span.sx1, lsy)]
    for (let at = first; at <= last; at++) {
      if (a[at] !== b[at]) return false
    }
  }
  return true
}

function sampleSpanOf(block: CollapseBlock): SampleSpan {
  const first = firstSampleOfBlock(block)
  return {
    sx0: first.sx - 1,
    sy0: first.sy - 1,
    sx1: first.sx + COLLAPSE_BLOCK_SAMPLES,
    sy1: first.sy + COLLAPSE_BLOCK_SAMPLES,
  }
}

/** The part of the span inside chunk `(cx, cy)`, in chunk-local samples. */
function localSpanOf(span: SampleSpan, cx: number, cy: number): SampleSpan {
  const [left, bottom] = [cx * CHUNK_SAMPLE_SIDE, cy * CHUNK_SAMPLE_SIDE]
  const last = CHUNK_SAMPLE_SIDE - 1
  return {
    sx0: Math.max(0, span.sx0 - left),
    sy0: Math.max(0, span.sy0 - bottom),
    sx1: Math.min(last, span.sx1 - left),
    sy1: Math.min(last, span.sy1 - bottom),
  }
}

/** A block is an eighth of a chunk, so its border reaches at most one neighbouring chunk. */
function chunkSpanOf(low: number, high: number): number[] {
  const [first, last] = [chunkOfSample(low), chunkOfSample(high)]
  return first === last ? [first] : [first, last]
}
