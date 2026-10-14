import { describe, expect, it } from 'vitest'
import { TICKS_PER_SECOND } from '../../../constants/physics'
import type { DomainEvent } from '../../../systems/authority/domainEvent'
import { emptyForkPaceTally, tallyForkPaceStep } from './forkPace'
import {
  lanePaceMissesOf,
  lanePaceOf,
  lanePaceTableOf,
  lanePaceVerdictOf,
  type LanePace,
} from './lanePace'

// The pins of a run forced onto a whole lane (ticket 266): P1 core within 58 minutes of the start,
// the slice inside 100-110 and P8 at 45 or more, each on the median of the seeds.

const MINUTE = 60 * TICKS_PER_SECOND
const CORE_COMPLETED: DomainEvent = { type: 'CoreCompleted', tick: 50 * MINUTE, durationTicks: 0 }

function paceOf(firstCore: number | null, slice: number | null, planet8: number | null): LanePace {
  const minutes = (value: number | null) => (value === null ? null : value * MINUTE)
  return {
    firstCoreTicks: minutes(firstCore),
    sliceTicks: minutes(slice),
    planetTicks: minutes(planet8),
  }
}

describe('tech tree: the pace pins of a run forced onto a lane', () => {
  it("reads planet 1's core from the start of the run", () => {
    const tally = emptyForkPaceTally()
    tallyForkPaceStep(tally, 1, 3, [])
    tallyForkPaceStep(tally, 1, 50 * MINUTE, [CORE_COMPLETED])
    expect(lanePaceOf(tally)).toEqual({
      firstCoreTicks: 50 * MINUTE,
      sliceTicks: null,
      planetTicks: null,
    })
  })

  it('passes a branch whose median seed meets all three pins', () => {
    const paces = [paceOf(54, 104, 50), paceOf(70, 120, 40), paceOf(57, 101, 46)]
    const verdict = lanePaceVerdictOf('phase', paces)
    expect(verdict).toMatchObject({ isFirstCoreInTime: true, isSliceInBand: true })
    expect(lanePaceMissesOf([verdict])).toEqual([])
  })

  it('names each pin the median misses, a core never completed counting as a miss', () => {
    const paces = [paceOf(59, 99, 44), paceOf(null, 98, null), paceOf(60, 111, 30)]
    expect(lanePaceMissesOf([lanePaceVerdictOf('arc', paces)])).toEqual([
      'arc: P1 core over 58 minutes',
      'arc: slice outside 100-110 minutes',
      'arc: P8 under 45 minutes',
    ])
  })

  it('prints the medians in minutes, a missing branch marked', () => {
    const verdict = lanePaceVerdictOf('arc', [paceOf(59, 104, 50)])
    expect(lanePaceTableOf([verdict])).toContain('| arc | 59.0 | 104.0 | 50.0 | miss |')
  })
})
