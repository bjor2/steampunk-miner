/**
 * How much chunk streaming a frame does, scaled with speed (TD scope c1 on #316, ticket 336):
 *
 * - `buildsPerFrame = clamp(ceil(newChunksPerSecond / 45), 1, 4)`: a new row of chunks, as wide as
 *   the view, arrives every 32 m, and one build a frame keeps up with 45 new chunks a second
 *   beside the drilled chunk's rebuilds;
 * - the lead the drive line is built ahead by, `T_lead = max(2 s, queue latency)`, the latency
 *   being the frames the queue takes to drain at that many builds a frame;
 * - the frame budget all of it runs under: work goes in order while the next item still fits the
 *   2 ms, judged by the largest item the frame ran so far. The first item always runs, so a cold
 *   chunk dearer than the budget never stalls the stream.
 */
import {
  CHUNK_BUILDS_PER_FRAME_MAX,
  CHUNK_BUILDS_PER_FRAME_MIN,
  CHUNK_PREFETCH_LEAD_MIN_SECONDS,
  CHUNK_STREAM_FRAMES_PER_SECOND,
  NEW_CHUNKS_PER_SECOND_PER_BUILD,
} from '../../constants/scene'
import { CHUNK_SIZE } from '../world/tileGrid'

/** Chunk meshes the frame may build at this speed and view radius (metres a second, metres). */
export function chunkBuildsPerFrame(speedMetresPerSecond: number, viewRadius: number): number {
  const wanted = Math.ceil(
    newChunksPerSecond(speedMetresPerSecond, viewRadius) / NEW_CHUNKS_PER_SECOND_PER_BUILD,
  )
  return Math.min(CHUNK_BUILDS_PER_FRAME_MAX, Math.max(CHUNK_BUILDS_PER_FRAME_MIN, wanted))
}

/** Chunks coming into view a second, worst case: a row as wide as the view every 32 m. */
export function newChunksPerSecond(speedMetresPerSecond: number, viewRadius: number): number {
  return (speedMetresPerSecond / CHUNK_SIZE) * chunksAcrossView(viewRadius)
}

/** The most chunks one row of the view circle touches: its diameter, straddling a chunk edge. */
export function chunksAcrossView(viewRadius: number): number {
  return Math.ceil((2 * viewRadius) / CHUNK_SIZE) + 1
}

/** How far ahead in time the drive line is built: 2 s, or longer while the queue takes longer. */
export function prefetchLeadSeconds(queueLength: number, buildsPerFrame: number): number {
  const latencySeconds = Math.ceil(queueLength / buildsPerFrame) / CHUNK_STREAM_FRAMES_PER_SECOND
  return Math.max(CHUNK_PREFETCH_LEAD_MIN_SECONDS, latencySeconds)
}

/**
 * Runs `work` in order while the frame has room and answers how many items ran. `runTimed` does
 * one item and answers what it cost in milliseconds; the caller owns the clock.
 */
export function spendFrameBudget<W>(
  work: readonly W[],
  runTimed: (item: W) => number,
  budgetMs: number,
): number {
  let spentMs = 0
  let largestMs = 0
  let ran = 0
  for (const item of work) {
    if (ran > 0 && spentMs + largestMs > budgetMs) break
    const costMs = runTimed(item)
    spentMs += costMs
    largestMs = Math.max(largestMs, costMs)
    ran++
  }
  return ran
}
