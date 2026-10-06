/**
 * A clock that falls due once per period of frames (#121: `memory_sample` every 10 s), fed the
 * render delta by the scene. Mutated in place, so feeding it every frame allocates nothing. Due
 * times stay on the period's grid; a stall longer than a period gives one sample, not a burst.
 */

export interface SampleClock {
  readonly periodSeconds: number
  sincePeriodStart: number
  elapsedSeconds: number
}

export function createSampleClock(periodSeconds: number): SampleClock {
  return { periodSeconds, sincePeriodStart: 0, elapsedSeconds: 0 }
}

export function advanceSampleClock(clock: SampleClock, dtSeconds: number): void {
  clock.sincePeriodStart += dtSeconds
  clock.elapsedSeconds += dtSeconds
}

export function isSampleDue(clock: SampleClock): boolean {
  return clock.sincePeriodStart >= clock.periodSeconds
}

/** Keeps the overshoot under one period, so the next sample stays on the grid. */
export function restartSamplePeriod(clock: SampleClock): void {
  clock.sincePeriodStart %= clock.periodSeconds
}

/** Seconds of frames the clock has seen, to the nearest whole second. */
export function wholeSecondsOf(clock: SampleClock): number {
  return Math.round(clock.elapsedSeconds)
}
