/**
 * The perf log (#11: `perf` events only in dev, scenario and debug runs; #38: one sample per
 * second). The composition root turns it on for those runs; a played release run records none.
 * Samples are stamped like every other line, at the authority's tick.
 */
import { getRunLog } from '../logging/runLog'
import type { PerfSample } from '../logging/perfSample'
import { readAuthorityState } from './authorityLink'
import { runEventPlaceOf, useGameStore } from './gameStore'

let isPerfLogOn = false

export function turnOnPerfLog(): void {
  isPerfLogOn = true
}

/** For tests: back to a played run's default. */
export function turnOffPerfLog(): void {
  isPerfLogOn = false
}

export function recordPerfSample(sample: PerfSample): void {
  if (!isPerfLogOn) return
  const stamp = { ...runEventPlaceOf(useGameStore.getState()), tick: readAuthorityState().tick }
  getRunLog().record(stamp, 'perf_sample', sample)
}
