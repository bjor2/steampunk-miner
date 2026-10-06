/**
 * The perf log (#11: `perf` events only in dev, scenario and debug runs; #38: one sample per
 * second; #121: a memory sample every 10 s). The composition root turns it on for those runs and
 * hands it the page and progress readers; a played release run records none and reads nothing.
 * Samples are stamped like every other line, at the authority's tick.
 */
import { memorySampleOf, type SceneMemory } from '../logging/memorySample'
import type { PerfSample } from '../logging/perfSample'
import type { RunEventData } from '../logging/eventNames'
import { getRunLog } from '../logging/runLog'
import type { RunProgress } from '../logging/runProgress'
import type { PageMemory } from '../shell/pageMemory'
import { readAuthorityState } from './authorityLink'
import { runEventPlaceOf, useGameStore } from './gameStore'

/** Where a memory sample's page and progress readings come from. */
export interface PerfLogSources {
  readPageMemory(): PageMemory
  readRunProgress(): RunProgress
}

type PerfEventName = 'perf_sample' | 'memory_sample'

let sources: PerfLogSources | null = null

export function turnOnPerfLog(perfSources: PerfLogSources): void {
  sources = perfSources
}

/** For tests: back to a played run's default. */
export function turnOffPerfLog(): void {
  sources = null
}

export function recordPerfSample(sample: PerfSample): void {
  if (sources === null) return
  recordStamped('perf_sample', sample)
}

/** `readScene` answers null while the renderer or the physics world is not up. */
export function recordMemorySample(
  readScene: () => SceneMemory | null,
  elapsedSeconds: number,
): void {
  if (sources === null) return
  recordStampedIfRead('memory_sample', memorySampleNow(sources, readScene(), elapsedSeconds))
}

function memorySampleNow(
  perfSources: PerfLogSources,
  scene: SceneMemory | null,
  elapsedSeconds: number,
): RunEventData<'memory_sample'> | null {
  if (scene === null) return null
  return memorySampleOf({
    elapsedSeconds,
    scene,
    page: perfSources.readPageMemory(),
    progress: perfSources.readRunProgress(),
  })
}

function recordStampedIfRead<N extends PerfEventName>(event: N, data: RunEventData<N> | null) {
  if (data !== null) recordStamped(event, data)
}

function recordStamped<N extends PerfEventName>(event: N, data: RunEventData<N>): void {
  const stamp = { ...runEventPlaceOf(useGameStore.getState()), tick: readAuthorityState().tick }
  getRunLog().record(stamp, event, data)
}
