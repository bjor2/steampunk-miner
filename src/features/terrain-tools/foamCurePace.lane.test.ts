import { describe, expect, it } from 'vitest'
import { TICKS_PER_SECOND } from '../../constants/physics'
import {
  curedCellsOf,
  foamCurePaceRunsOn,
  FOAM_CURE_PACE_PLANETS,
  FOAM_CURE_PACE_SEEDS,
} from './foamCurePaceRuns'
import { coreTicksOf, median, MIN_TIME_BP, timeRatioBp } from './magnetPaceRuns'

// Stabiliser foam's permanent cure pace gate (the #157 GD ruling and TD lock, the bot gate of
// ticket 368): with foam slotted at its cure Mark and pressed at every chance, the pacing bot
// reaches each planet's core no faster than 0.98x its time without, on the same seeds, judged on
// the median of the three pacing seeds (#84), on P1-P10 and headless P40. Both runs get the same
// research grant, so only the foam differs. Long: 66 bot runs, run by name for the box Tester.

const TIMEOUT_MS = 2 * 60 * 60 * 1000
const TICKS_PER_MINUTE = 60 * TICKS_PER_SECOND

describe('stabiliser foam cure pace (#157 iv)', () => {
  it.each(FOAM_CURE_PACE_PLANETS)(
    'keeps time to core at least 0.98x the time without the cure on planet %i',
    (planet) => {
      const runs = FOAM_CURE_PACE_SEEDS.map((seed) => foamCurePaceRunsOn(planet, seed))
      for (const { seed, bare, withCure } of runs) {
        const minutes = (ticks: number) => (ticks / TICKS_PER_MINUTE).toFixed(1)
        console.log(
          `P${planet} seed ${seed}: bare ${minutes(coreTicksOf(bare))} min, cured ` +
            `${minutes(coreTicksOf(withCure))} min, ${curedCellsOf(withCure)} cells cured`,
        )
      }
      const ratios = runs.map(({ bare, withCure }) => timeRatioBp(withCure, bare))
      expect(median(ratios)).toBeGreaterThanOrEqual(MIN_TIME_BP)
    },
    TIMEOUT_MS,
  )
})
