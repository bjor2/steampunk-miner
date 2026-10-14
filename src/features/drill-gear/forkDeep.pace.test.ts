import { describe, expect, it } from 'vitest'
import type { CommandIntent } from '../../systems/authority/authorityCommand'
import { ARRIVAL_MONEY, arrivedPaceSessionOn } from '../../systems/bot/paceArrival'
import { foldDrillGear } from '../../systems/economy/drillGearCaps'
import { ECONOMY } from '../../systems/economy/economy'
import { cmp, fromCanonical } from '../../systems/money'
import { activeForkBranchOf, CHOOSE_FORK_COMMAND, FORK_TIER } from '../tech-tree'
import { coreRunOn, coreTicksOf, median, PACE_SEEDS } from './drillGearPaceRuns'
import { DEEP_BRANCH, forkValueOf, PLUNGE_CROWN_ID } from './systems/drillGearFork'

// The GD lock on #255 (build 3, ticket 268): "Deep beats on-curve descent by at most one drill
// step (x1.225 dig speed) and stays inside the aheadCells = 1 clamp". The pacing bot arrives on
// the fork's planet and four planets on with the on-curve levels and plays to the core twice on
// each pacing seed: once with the drill-gear fork unchosen and once with Deep chosen. Both runs
// pass through the same rich wallet and back to the arrival's money, so only the branch differs.
// The median of the per-seed speed-ups (bare ticks over Deep ticks, #84's median of three) stays
// at or under one drill step. Long: a dozen bot runs, for the box Tester
// (`npx vitest run src/features/drill-gear/forkDeep.pace.test.ts`). The clamp is checked first,
// and quickly, on the numbers the runs use.

const TIMEOUT_MS = 60 * 60 * 1000

/** One drill step of dig speed, as the lock writes it. */
const ONE_DRILL_STEP = 1.225

const FORK_PACE_PLANETS = [FORK_TIER, FORK_TIER + 4] as const

const RICH: CommandIntent = { type: 'debug.setMoney', payload: { amount: '1e30' } }
const ARRIVED: CommandIntent = { type: 'debug.setMoney', payload: { amount: ARRIVAL_MONEY } }
const CHOOSE_DEEP = {
  type: CHOOSE_FORK_COMMAND,
  payload: { lane: 'drill-gear', branch: DEEP_BRANCH },
} as CommandIntent

const UNCHOSEN: readonly CommandIntent[] = [RICH, ARRIVED]
const DEEP_CHOSEN: readonly CommandIntent[] = [RICH, CHOOSE_DEEP, ARRIVED]

describe('drill-gear fork: Deep pace (GD lock on #255)', () => {
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
    'reaches planet %i core at most one drill step faster than on-curve descent with Deep chosen',
    (planet) => {
      const speedUps = PACE_SEEDS.map((seed) => {
        const bare = coreTicksOf(coreRunOn(planet, seed, UNCHOSEN))
        const deep = coreTicksOf(coreRunOn(planet, seed, DEEP_CHOSEN))
        console.log(`P${planet} seed ${seed}: unchosen ${bare}, Deep ${deep} ticks`)
        return bare / deep
      })
      expect(median(speedUps)).toBeLessThanOrEqual(ONE_DRILL_STEP)
    },
    TIMEOUT_MS,
  )
})
