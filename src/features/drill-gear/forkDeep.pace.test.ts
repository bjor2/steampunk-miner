import { describe, expect, it } from 'vitest'
import { ARRIVAL_MONEY, arrivedPaceSessionOn } from '../../systems/bot/paceArrival'
import { foldDrillGear } from '../../systems/economy/drillGearCaps'
import { ECONOMY } from '../../systems/economy/economy'
import { cmp, fromCanonical } from '../../systems/money'
import { activeForkBranchOf, FORK_TIER } from '../tech-tree'
import { PACE_SEEDS } from './drillGearPaceRuns'
import { DEEP_CHOSEN, deepPaceOn, MEASURABLY_FASTER, UNCHOSEN } from './forkDeepPaceRuns'
import { DEEP_BRANCH, forkValueOf, PLUNGE_CROWN_ID } from './systems/drillGearFork'

// The GD lock on #255 (build 3, ticket 268) and the GD ruling on #392 (ticket 392): Deep beats
// on-curve descent measurably, inside the aheadCells = 1 clamp. The bot's scripted bore cuts with
// the drill gear (ticket 392), so the cell Deep opens below the bored one is one the bot then
// drives into. On the fork's planet and four planets on, the bot plays to the core with Deep
// chosen and unchosen on each pacing seed (`forkDeepPaceRuns.ts`). Gated on the seed medians (#84):
// the speed-up above 1.02, and Deep never pushing travel over a quarter of the run. Travel is
// compared only on seeds whose bare run reached the core, and a bare run already over the quarter
// leaves Deep ungated with a finding printed for #397's travel target (GD ruling on #392, option
// (a)). One drill step (x1.225) is never a cap: a median past it is printed as a balance finding
// for Systems, and the bot is never patched to hide it. Planet 40 is the lane
// `forkDeepP40.lane.test.ts`. Long: a dozen bot runs, for the box Tester
// (`npx vitest run src/features/drill-gear/forkDeep.pace.test.ts`). The clamp is checked first,
// and quickly, on the numbers the runs use.

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
    'reaches planet %i core measurably faster with Deep, never pushing travel past a quarter',
    (planet) => {
      const pace = deepPaceOn(planet)
      expect(pace.speedUp).toBeGreaterThan(MEASURABLY_FASTER)
      expect(pace.travel).not.toBe('pushed_over_cap')
    },
    TIMEOUT_MS,
  )

  // The bare bot already travels past a quarter on planet 16 (GD ruling on #392, option (a)).
  it.todo(
    "gates Deep's travel on planet 16 once the bare bot travels under #397's quarter target there",
  )
})
