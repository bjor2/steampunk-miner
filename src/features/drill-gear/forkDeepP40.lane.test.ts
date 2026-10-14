import { describe, expect, it } from 'vitest'
import { PACE_SEEDS } from './drillGearPaceRuns'
import { deepPaceOn } from './forkDeepPaceRuns'

// The GD ruling on #392 (ticket 392): beside P16 and P20 (`forkDeep.pace.test.ts`), a planet-40
// headless check at the re-baseline. The same gates on the same runs: on each pacing seed the bot
// arrives on planet 40 on-curve and plays to the core with Deep chosen and unchosen; the median
// speed-up is above 1.02 and at or under one drill step, and Deep keeps travel inside a quarter of
// the run. A lane: it runs only when named,
// `npx vitest run src/features/drill-gear/forkDeepP40.lane.test.ts`.

/** One drill step of dig speed, as the #255 lock writes it: the speed-up's ceiling. */
const ONE_DRILL_STEP = 1.225
/** "Measurably faster" (GD ruling on #392): the speed-up's floor. */
const MEASURABLY_FASTER = 1.02
const HEADLESS_PLANET = 40
const TIMEOUT_MS = 3 * 60 * 60 * 1000

describe('drill-gear fork: Deep pace on planet 40 (GD ruling on #392)', () => {
  it(
    'reaches planet 40 core measurably faster with Deep, by at most one drill step',
    () => {
      const pace = deepPaceOn(HEADLESS_PLANET)
      expect(pace.speedUp).toBeGreaterThan(MEASURABLY_FASTER)
      expect(pace.speedUp).toBeLessThanOrEqual(ONE_DRILL_STEP)
      expect(pace.isTravelKept).toEqual(PACE_SEEDS.map(() => true))
    },
    TIMEOUT_MS,
  )
})
