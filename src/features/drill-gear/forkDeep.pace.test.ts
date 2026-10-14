import { describe, expect, it } from 'vitest'
import { ARRIVAL_MONEY, arrivedPaceSessionOn } from '../../systems/bot/paceArrival'
import { foldDrillGear } from '../../systems/economy/drillGearCaps'
import { ECONOMY } from '../../systems/economy/economy'
import { cmp, fromCanonical } from '../../systems/money'
import { activeForkBranchOf, FORK_TIER } from '../tech-tree'
import { PACE_SEEDS } from './drillGearPaceRuns'
import { DEEP_CHOSEN, deepPaceOn, UNCHOSEN } from './forkDeepPaceRuns'
import { DEEP_BRANCH, forkValueOf, PLUNGE_CROWN_ID } from './systems/drillGearFork'

// The GD lock on #255 (build 3, ticket 268) and the GD ruling on #392 (ticket 392): Deep beats
// on-curve descent measurably, by at most one drill step (x1.225 dig speed), inside the
// aheadCells = 1 clamp. The bot's scripted bore cuts with the drill gear (ticket 392), so the cell
// Deep opens below the bored one is one the bot then drives into. On the fork's planet and four
// planets on, the bot plays to the core with Deep chosen and unchosen on each pacing seed
// (`forkDeepPaceRuns.ts`). On the median of the per-seed speed-ups: above 1.02, and at or under
// one drill step. The ceiling is a pace assert, never a speed cap: a result above it is a balance
// finding for Systems, and the bot is never patched to hide it. Beside it, Deep never pushes travel
// above a quarter of the run on any seed. Planet 40 is the lane `forkDeepP40.lane.test.ts`. Long:
// a dozen bot runs, for the box Tester (`npx vitest run src/features/drill-gear/forkDeep.pace.test.ts`).
// The clamp is checked first, and quickly, on the numbers the runs use.

/** One drill step of dig speed, as the #255 lock writes it: the speed-up's ceiling. */
const ONE_DRILL_STEP = 1.225
/** "Measurably faster" (GD ruling on #392): the speed-up's floor. */
const MEASURABLY_FASTER = 1.02

const TIMEOUT_MS = 60 * 60 * 1000

const FORK_PACE_PLANETS = [FORK_TIER, FORK_TIER + 4] as const

describe('drill-gear fork: Deep pace (GD lock on #255, GD ruling on #392)', () => {
  it('asks no more than the aheadCells = 1 clamp, alone or beside every other ahead ask', () => {
    const crown = { aheadCells: forkValueOf(PLUNGE_CROWN_ID, 'aheadCells') }
    expect(ECONOMY.drillGearCaps.aheadCellsMax).toBe(1)
    expect(crown.aheadCells).toBeLessThanOrEqual(ECONOMY.drillGearCaps.aheadCellsMax)
    const beside = [crown, { aheadCells: 1 }, { aheadCells: 1, aheadAim: 'drive' as const }]
    expect(foldDrillGear(beside, ECONOMY.drillGearCaps)?.aheadCells).toBe(1)
  })

  it('sets the Deep run off with Deep chosen and the arrival money, the other unchosen', () => {
    const [seed] = PACE_SEEDS
    const runs = [UNCHOSEN, DEEP_CHOSEN].map((setup) =>
      arrivedPaceSessionOn(FORK_TIER, seed, setup).state(),
    )
    expect(runs.map((state) => activeForkBranchOf(state, 'p1', 'drill-gear'))).toEqual([
      null,
      DEEP_BRANCH,
    ])
    const arrival = fromCanonical(ARRIVAL_MONEY)
    expect(runs.map((state) => cmp(state.players.p1.wallet, arrival))).toEqual([0, 0])
  })

  it.each(FORK_PACE_PLANETS)(
    'reaches planet %i core measurably faster with Deep, by at most one drill step',
    (planet) => {
      const pace = deepPaceOn(planet)
      expect(pace.speedUp).toBeGreaterThan(MEASURABLY_FASTER)
      expect(pace.speedUp).toBeLessThanOrEqual(ONE_DRILL_STEP)
      expect(pace.isTravelKept).toEqual(PACE_SEEDS.map(() => true))
    },
    TIMEOUT_MS,
  )
})
