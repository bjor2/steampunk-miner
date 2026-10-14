import { describe, expect, it } from 'vitest'
import { TICKS_PER_SECOND } from '../../constants/physics'
import { foamSpraysOf } from './foamPaceRuns'
import {
  foamRestockedOf,
  foamRestockPaceRunsOn,
  FOAM_RESTOCK_PACE_PLANETS,
  FOAM_RESTOCK_PACE_SEEDS,
} from './foamRestockPaceRuns'
import { coreTicksOf, median, MIN_TIME_BP, timeRatioBp } from './magnetPaceRuns'

// The shared collapse-delay pace gate rerun with foam restocked (ticket 394, the VS condition of
// the GD ruling on #381): with the bore gun, the lode clamp, foam, its cure (reinforcement) and
// the refractory (cement) lining all owned, foam pressed at every chance and restocked at every
// Upgrade bay visit, the pacing bot reaches each planet's core no faster than 0.98x its never-foam
// time on the same seeds, judged on the median of the three pacing seeds (#84), on P1-P10 and P40
// at the re-baseline. Long: 66 bot runs, run by name for the box Tester.

const TIMEOUT_MS = 2 * 60 * 60 * 1000
const TICKS_PER_MINUTE = 60 * TICKS_PER_SECOND

describe('stabiliser foam restock pace (ticket 394)', () => {
  it.each(FOAM_RESTOCK_PACE_PLANETS)(
    'keeps time to core at least 0.98x the never-foam time on planet %i',
    (planet) => {
      const runs = FOAM_RESTOCK_PACE_SEEDS.map((seed) => foamRestockPaceRunsOn(planet, seed))
      for (const { seed, neverFoam, withHolders } of runs) {
        const minutes = (ticks: number) => (ticks / TICKS_PER_MINUTE).toFixed(1)
        console.log(
          `P${planet} seed ${seed}: never-foam ${minutes(coreTicksOf(neverFoam))} min, holders ` +
            `${minutes(coreTicksOf(withHolders))} min, ${foamSpraysOf(withHolders)} sprays, ` +
            `${foamRestockedOf(withHolders)} charges restocked`,
        )
      }
      const ratios = runs.map(({ neverFoam, withHolders }) => timeRatioBp(withHolders, neverFoam))
      expect(median(ratios)).toBeGreaterThanOrEqual(MIN_TIME_BP)
    },
    TIMEOUT_MS,
  )
})
