import { describe, expect, it } from 'vitest'
import { deepPaceOn, MEASURABLY_FASTER } from './forkDeepPaceRuns'

// The GD ruling on #392 (ticket 392): beside P16 and P20 (`forkDeep.pace.test.ts`), a planet-40
// headless check at the re-baseline. The same gates on the same runs: on each pacing seed the bot
// arrives on planet 40 on-curve and plays to the core with Deep chosen and unchosen; on the seed
// medians the speed-up is above 1.02 and Deep never pushes travel past a quarter of the run (a
// bare run over it already prints a finding for #397 instead, option (a)). A median
// past one drill step is printed as a balance finding, never failed. A lane: it runs only when
// named, `npx vitest run src/features/drill-gear/forkDeepP40.lane.test.ts`.

const HEADLESS_PLANET = 40
const TIMEOUT_MS = 3 * 60 * 60 * 1000

describe('drill-gear fork: Deep pace on planet 40 (GD ruling on #392)', () => {
  it(
    'reaches planet 40 core measurably faster with Deep, never pushing travel past a quarter',
    () => {
      const pace = deepPaceOn(HEADLESS_PLANET)
      expect(pace.speedUp).toBeGreaterThan(MEASURABLY_FASTER)
      expect(pace.travel).not.toBe('pushed_over_cap')
    },
    TIMEOUT_MS,
  )
})
