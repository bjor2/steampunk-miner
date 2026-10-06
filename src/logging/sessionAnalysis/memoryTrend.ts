/**
 * Memory against progress, per session (#125, logging strategy section 6 step 3): how fast the JS
 * heap grows per 100 minerals, per 10 minutes of frames and per 100 chunks generated, and whether
 * the renderer's geometries and textures or the physics colliders keep climbing as chunks load,
 * where they should stay flat once warmed up. Read from `memory_sample` lines (#121); no GC is
 * forced in a session, so the heap is the live heap, not the retained one the soak gates on.
 */
import type { RunEvent } from '../runEvent'
import { eventsNamed, type SessionLog } from './sessionTable'
import { slopeOf } from './trendMaths'

/**
 * The first 30 s of samples are loading and first-use buffers, skipped as the memory soak skips
 * its 4 warm-up cycles (#99 gate).
 */
export const WARM_UP_SAMPLES = 3
/** A count climbs when it rose in at least 3 of its last 10 steps and never fell (#99 gate). */
const TREND_STEPS = 10
const MIN_RISING_STEPS = 3

const KIB_PER_MIB = 1024
const SECONDS_PER_TEN_MINUTES = 600
const HUNDRED = 100

export interface HeapTrend {
  runId: string
  commit: string
  /** Samples after warm-up, the ones every number below reads. */
  samples: number
  heapFirstMB: number
  heapLastMB: number
  heapPeakMB: number
  mbPer100Minerals: number | null
  mbPer10Minutes: number | null
  mbPer100Chunks: number | null
}

export const TRACKED_COUNTS = ['geometries', 'textures', 'colliders'] as const
export type TrackedCount = (typeof TRACKED_COUNTS)[number]

export interface CountTrend {
  runId: string
  commit: string
  count: TrackedCount
  first: number
  last: number
  /** Least-squares growth per 100 chunks generated; null when no chunk was generated. */
  per100Chunks: number | null
  risingSteps: number
  isClimbing: boolean
}

type MemorySample = RunEvent<'memory_sample'>['data']

/** Sessions with at least one sample after warm-up. */
export function heapTrendsOf(sessions: readonly SessionLog[]): HeapTrend[] {
  return sessions.flatMap(heapTrendsOfSession)
}

export function countTrendsOf(sessions: readonly SessionLog[]): CountTrend[] {
  return sessions.flatMap(countTrendsOfSession)
}

function heapTrendsOfSession(session: SessionLog): HeapTrend[] {
  const settled = settledSamplesOf(session)
  return settled.length === 0 ? [] : [heapTrendOf(session, settled)]
}

function countTrendsOfSession(session: SessionLog): CountTrend[] {
  const settled = settledSamplesOf(session)
  if (settled.length === 0) return []
  return TRACKED_COUNTS.map((count) => countTrendOf(session, settled, count))
}

function settledSamplesOf(session: SessionLog): MemorySample[] {
  return eventsNamed(session, 'memory_sample')
    .map((line) => line.data)
    .slice(WARM_UP_SAMPLES)
}

function heapTrendOf(session: SessionLog, settled: readonly MemorySample[]): HeapTrend {
  const heapKB = settled.map((sample) => sample.jsHeapUsedKB)
  return {
    runId: session.runId,
    commit: session.commit,
    samples: settled.length,
    heapFirstMB: heapKB[0] / KIB_PER_MIB,
    heapLastMB: heapKB[heapKB.length - 1] / KIB_PER_MIB,
    heapPeakMB: Math.max(...heapKB) / KIB_PER_MIB,
    mbPer100Minerals: heapMBPer(settled, (sample) => sample.mineralsCollected, HUNDRED),
    mbPer10Minutes: heapMBPer(settled, (sample) => sample.elapsedS, SECONDS_PER_TEN_MINUTES),
    mbPer100Chunks: heapMBPer(settled, (sample) => sample.chunksCached, HUNDRED),
  }
}

/** The heap's slope against one progress marker, in MB per `step` of it. */
function heapMBPer(
  settled: readonly MemorySample[],
  progressOf: (sample: MemorySample) => number,
  step: number,
): number | null {
  const kibPerUnit = slopeOf(settled.map((sample) => [progressOf(sample), sample.jsHeapUsedKB]))
  return kibPerUnit === null ? null : (kibPerUnit * step) / KIB_PER_MIB
}

function countTrendOf(
  session: SessionLog,
  settled: readonly MemorySample[],
  count: TrackedCount,
): CountTrend {
  const values = settled.map((sample) => sample[count])
  const growthPerChunk = slopeOf(settled.map((sample) => [sample.chunksCached, sample[count]]))
  const steps = lastStepsOf(values)
  const risingSteps = steps.filter((step) => step > 0).length
  return {
    runId: session.runId,
    commit: session.commit,
    count,
    first: values[0],
    last: values[values.length - 1],
    per100Chunks: growthPerChunk === null ? null : growthPerChunk * HUNDRED,
    risingSteps,
    isClimbing: risingSteps >= MIN_RISING_STEPS && steps.every((step) => step >= 0),
  }
}

function lastStepsOf(values: readonly number[]): number[] {
  const tail = values.slice(-(TREND_STEPS + 1))
  return tail.slice(1).map((value, at) => value - tail[at])
}
