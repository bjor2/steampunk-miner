import { describe, expect, it } from 'vitest'
import { SAVE_SNAPSHOT_SECONDS } from '../../constants/scene'
import {
  advanceSampleClock,
  createSampleClock,
  isSampleDue,
  restartSamplePeriod,
  wholeSecondsOf,
} from '../render/sampleClock'

/** Steps a save-snapshot clock for `seconds` and returns the whole seconds each snapshot fell due. */
function snapshotSecondsOver(stepsPerSecond: number, seconds: number): number[] {
  const clock = createSampleClock(SAVE_SNAPSHOT_SECONDS)
  const dueAt: number[] = []
  for (let step = 0; step < stepsPerSecond * seconds; step++) {
    advanceSampleClock(clock, 1 / stepsPerSecond)
    if (!isSampleDue(clock)) continue
    dueAt.push(wholeSecondsOf(clock))
    restartSamplePeriod(clock)
  }
  return dueAt
}

describe('save snapshot cadence', () => {
  it('falls due every 5 minutes of frames at 30 and at 144 steps/s', () => {
    expect(snapshotSecondsOver(30, 16 * 60)).toEqual([300, 600, 900])
    expect(snapshotSecondsOver(144, 16 * 60)).toEqual([300, 600, 900])
  })
})
