import { describe, expect, it } from 'vitest'
import { TICKS_PER_SECOND } from '../../../constants/physics'
import type { DomainEvent } from '../../../systems/authority/domainEvent'
import {
  areSliceMediansClose,
  emptyForkPaceTally,
  forkPaceOf,
  forkPaceVerdictOf,
  medianTicks,
  minutesOfTicks,
  tallyForkPaceStep,
  type ForkPace,
} from './forkPace'

const MINUTE = 60 * TICKS_PER_SECOND
const CORE_COMPLETED = { tick: 0, type: 'CoreCompleted', durationTicks: 1 } as DomainEvent

function pace(sliceMinutes: number | null, planetMinutes: number | null): ForkPace {
  return {
    sliceTicks: sliceMinutes === null ? null : sliceMinutes * MINUTE,
    planetTicks: planetMinutes === null ? null : planetMinutes * MINUTE,
  }
}

// `balance:forks` (GD lock on #255, ticket 267): P8 at 45 or more, the slice at 100-110, and a
// pair's slice medians within 10%, all on the median of the pacing seeds.
describe('tech tree: fork pace pins', () => {
  it('reads the slice from the run start and planet 8 from its arrival', () => {
    const tally = emptyForkPaceTally()
    tallyForkPaceStep(tally, 1, 0, [])
    tallyForkPaceStep(tally, 2, 40 * MINUTE, [])
    tallyForkPaceStep(tally, 2, 104 * MINUTE, [CORE_COMPLETED])
    tallyForkPaceStep(tally, 2, 105 * MINUTE, [CORE_COMPLETED])
    tallyForkPaceStep(tally, 8, 500 * MINUTE, [])
    tallyForkPaceStep(tally, 8, 548 * MINUTE, [CORE_COMPLETED])
    expect(forkPaceOf(tally)).toEqual(pace(104, 48))
  })

  it('reads never for a core the run did not complete', () => {
    const tally = emptyForkPaceTally()
    tallyForkPaceStep(tally, 8, 0, [])
    expect(forkPaceOf(tally)).toEqual(pace(null, null))
  })

  it('holds planet 8 to its 45-minute floor and the slice to 100-110 on the median seed', () => {
    const passing = forkPaceVerdictOf('wide', [pace(99, 40), pace(104, 46), pace(111, 52)])
    expect(passing).toMatchObject({ isPlanetSlowEnough: true, isSliceInBand: true })
    const fast = forkPaceVerdictOf('deep', [pace(95, 44), pace(99, 44.9), pace(120, 60)])
    expect(fast).toMatchObject({ isPlanetSlowEnough: false, isSliceInBand: false })
  })

  it('sorts a never after every time, so a median never fails both pins', () => {
    expect(medianTicks([null, 3, null])).toBeNull()
    expect(medianTicks([null, 3, 1])).toBe(3)
    const stalled = forkPaceVerdictOf('agile', [pace(null, null), pace(105, null), pace(106, 50)])
    expect(stalled).toMatchObject({ isPlanetSlowEnough: false, isSliceInBand: true })
  })

  it('passes slice medians within 10% of each other and fails them past it or with a never', () => {
    const at100 = forkPaceVerdictOf('scout', [pace(100, 50)])
    expect(areSliceMediansClose(at100, forkPaceVerdictOf('diviner', [pace(110, 50)]))).toBe(true)
    expect(areSliceMediansClose(forkPaceVerdictOf('diviner', [pace(110.5, 50)]), at100)).toBe(false)
    expect(areSliceMediansClose(at100, forkPaceVerdictOf('diviner', [pace(null, 50)]))).toBe(false)
  })

  it('prints minutes to one place and a never as never', () => {
    expect(minutesOfTicks(104.25 * MINUTE)).toBe('104.3')
    expect(minutesOfTicks(null)).toBe('never')
  })
})
