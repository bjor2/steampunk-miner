/**
 * The perf log (#11: `perf` events only in dev, scenario and debug runs; #38: one sample per
 * second; #121: a memory sample every 10 s). The composition root turns it on for those runs and
 * hands it the page and progress readers; a played release run records none and reads nothing.
 * Samples are stamped like every other line, at the authority's tick. Each sample also tells a
 * debug run's snapshots (#123) how the frames and the heap are doing.
 */
import { memorySampleOf, type SceneMemory } from '../logging/memorySample'
import type { PerfSample } from '../logging/perfSample'
import type { RunEventData } from '../logging/eventNames'
import { getRunLog } from '../logging/runLog'
import type { RunProgress } from '../logging/runProgress'
import type { PageMemory } from '../shell/pageMemory'
import { readAuthorityState } from './authorityLink'
import { runEventPlaceOf, useGameStore } from './gameStore'
import { snapshotBudgetBreach, snapshotHeapStep } from './runSnapshots'

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
  snapshotBudgetBreach(sample.frameMsP95)
}

/** `readScene` answers null while the renderer or the physics world is not up. */
export function recordMemorySample(
  readScene: () => SceneMemory | null,
  elapsedSeconds: number,
): void {
  if (sources === null) return
  recordMemorySampleIfRead(memorySampleNow(sources, readScene(), elapsedSeconds))
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

function recordMemorySampleIfRead(sample: RunEventData<'memory_sample'> | null): void {
  if (sample === null) return
  recordStamped('memory_sample', sample)
  snapshotHeapStep(sample.jsHeapUsedKB)
}

function recordStamped<N extends PerfEventName>(event: N, data: RunEventData<N>): void {
  const stamp = { ...runEventPlaceOf(useGameStore.getState()), tick: readAuthorityState().tick }
  getRunLog().record(stamp, event, data)
}
