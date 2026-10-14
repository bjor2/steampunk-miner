/**
 * Spec plumbing for the Deep pace asserts (GD lock on #255, GD ruling on #392, ticket 392): on
 * each pacing seed the bot arrives on a planet with the on-curve levels and plays to its core
 * twice, once with Deep chosen and once unchosen with its own fork pick switched off, so it never
 * buys Deep mid-run. Both runs pass through the same rich wallet and back to the arrival's money,
 * so only the branch differs. Only specs use it.
 */
import type { CommandIntent } from '../../systems/authority/authorityCommand'
import { ARRIVAL_MONEY } from '../../systems/bot/paceArrival'
import type { SliceRun } from '../../systems/bot/playSlice'
import { CHOOSE_FORK_COMMAND, withoutPacingBotForkPicks } from '../tech-tree'
import { coreRunOn, coreTicksOf, median, PACE_SEEDS } from './drillGearPaceRuns'
import { DEEP_BRANCH } from './systems/drillGearFork'
import { isTravelKeptByDeep, travelShareBpOf } from './systems/travelShare'

const RICH: CommandIntent = { type: 'debug.setMoney', payload: { amount: '1e30' } }
const ARRIVED: CommandIntent = { type: 'debug.setMoney', payload: { amount: ARRIVAL_MONEY } }
const CHOOSE_DEEP = {
  type: CHOOSE_FORK_COMMAND,
  payload: { lane: 'drill-gear', branch: DEEP_BRANCH },
} as CommandIntent

export const UNCHOSEN: readonly CommandIntent[] = [RICH, ARRIVED]
export const DEEP_CHOSEN: readonly CommandIntent[] = [RICH, CHOOSE_DEEP, ARRIVED]

/** What the gates read of one planet's runs on every seed. */
export interface DeepPace {
  /** The median of the per-seed speed-ups, bare ticks over Deep ticks (#84). */
  speedUp: number
  /** Per seed: Deep kept travel inside a quarter of the run, or no higher than bare. */
  isTravelKept: boolean[]
}

/** The two runs on every pacing seed, printed per seed and folded for the gates. */
export function deepPaceOn(planet: number): DeepPace {
  const seeds = PACE_SEEDS.map((seed) => seedPaceOn(planet, seed))
  return {
    speedUp: median(seeds.map((seed) => seed.speedUp)),
    isTravelKept: seeds.map((seed) => isTravelKeptByDeep(seed.deepTravelBp, seed.bareTravelBp)),
  }
}

interface SeedPace {
  speedUp: number
  deepTravelBp: number
  bareTravelBp: number
}

function seedPaceOn(planet: number, seed: number): SeedPace {
  const bare = bareRunOn(planet, seed)
  const deep = coreRunOn(planet, seed, DEEP_CHOSEN)
  const [bareTicks, deepTicks] = [coreTicksOf(bare), coreTicksOf(deep)]
  const pace = {
    speedUp: bareTicks / deepTicks,
    deepTravelBp: travelShareBpOf(deep.commands, 'p1', deepTicks),
    bareTravelBp: travelShareBpOf(bare.commands, 'p1', bareTicks),
  }
  console.log(`P${planet} seed ${seed}: unchosen ${bareTicks}, Deep ${deepTicks} ticks`, pace)
  return pace
}

/** The bot from arrival to the core without Deep: unchosen, and never choosing it on its own. */
function bareRunOn(planet: number, seed: number): SliceRun {
  return withoutPacingBotForkPicks(() => coreRunOn(planet, seed, UNCHOSEN))
}
