import { describe, expect, it } from 'vitest'
import { TICKS_PER_SECOND } from '../../constants/physics'
import { foamPaceRunsOn, foamSpraysOf, FOAM_PACE_PLANETS, FOAM_PACE_SEEDS } from './foamPaceRuns'
import { coreTicksOf, median, MIN_TIME_BP, timeRatioBp } from './magnetPaceRuns'

// Stabiliser foam's pace gate (the VS pin on #381, ticket 381): with foam, the lode clamp and the
// refractory (cement) lining granted together and pressed at every chance, the pacing bot reaches
// each planet's core no faster than 0.98x its bare time, judged on the median of the three pacing
// seeds (#84), on foam's planet 3 and the magnet gate's 7 and 10. Foam's stack is never restocked,
// so a run sprays it at most four times. Long: eighteen bot runs, for the box Tester.

const TIMEOUT_MS = 60 * 60 * 1000
const TICKS_PER_MINUTE = 60 * TICKS_PER_SECOND

describe('stabiliser foam pace (VS pin on #381)', () => {
  it.each(FOAM_PACE_PLANETS)(
    'keeps time to core at least 0.98x the bare time on planet %i',
    (planet) => {
      const runs = FOAM_PACE_SEEDS.map((seed) => foamPaceRunsOn(planet, seed))
      for (const { seed, bare, withHolders } of runs) {
        const minutes = (ticks: number) => (ticks / TICKS_PER_MINUTE).toFixed(1)
        console.log(
          `P${planet} seed ${seed}: bare ${minutes(coreTicksOf(bare))} min, holders ` +
            `${minutes(coreTicksOf(withHolders))} min, ${foamSpraysOf(withHolders)} sprays`,
        )
      }
      const ratios = runs.map(({ bare, withHolders }) => timeRatioBp(withHolders, bare))
      expect(median(ratios)).toBeGreaterThanOrEqual(MIN_TIME_BP)
    },
    TIMEOUT_MS,
  )
})
