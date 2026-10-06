import { describe, expect, it } from 'vitest'
import {
  advanceSampleClock,
  createSampleClock,
  isSampleDue,
  restartSamplePeriod,
  wholeSecondsOf,
} from './sampleClock'

/** Steps the clock at `stepsPerSecond` for `seconds` and returns the whole seconds of each sample. */
function sampleSecondsOver(stepsPerSecond: number, seconds: number): number[] {
  const clock = createSampleClock(10)
  const sampledAt: number[] = []
  for (let step = 0; step < stepsPerSecond * seconds; step++) {
    advanceSampleClock(clock, 1 / stepsPerSecond)
    if (!isSampleDue(clock)) continue
    sampledAt.push(wholeSecondsOf(clock))
    restartSamplePeriod(clock)
  }
  return sampledAt
}

describe('sample clock', () => {
  it('falls due every 10 s at 30 and at 144 steps/s', () => {
    const tenSecondGrid = [10, 20, 30, 40, 50, 60]
    expect(sampleSecondsOver(30, 61)).toEqual(tenSecondGrid)
    expect(sampleSecondsOver(144, 61)).toEqual(tenSecondGrid)
  })

  it('is not due before its first period has passed', () => {
    const clock = createSampleClock(10)
    advanceSampleClock(clock, 9.9)
    expect(isSampleDue(clock)).toBe(false)
  })

  it('falls due once, not in a burst, after a stall longer than a period', () => {
    const clock = createSampleClock(10)
    advanceSampleClock(clock, 25)
    expect(isSampleDue(clock)).toBe(true)
    restartSamplePeriod(clock)
    expect(isSampleDue(clock)).toBe(false)
    advanceSampleClock(clock, 5)
    expect(isSampleDue(clock)).toBe(true)
    expect(wholeSecondsOf(clock)).toBe(30)
  })
})
