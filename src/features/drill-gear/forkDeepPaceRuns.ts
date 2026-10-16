/**
 * Spec plumbing for the Deep pace asserts (GD lock on #255, GD ruling on #392, ticket 392): on
 * each pacing seed the bot arrives on a planet with the on-curve levels and plays to its core
 * twice, once with Deep chosen and once unchosen with its own fork pick switched off, so it never
 * buys Deep mid-run. Both runs pass through the same rich wallet and back to the arrival's money,
 * so only the branch differs. Speed-up and travel are judged on the seed medians (#84), so one
 * seed's stall cannot flip a gate; travel only on the seeds whose bare run reached the core, and
 * a bare run already over the cap prints a finding for #397 instead of gating Deep (GD ruling on
 * #392, option (a)). A median past one drill step is printed as a balance finding for
 * Systems, never failed: the GD ruling on #392 says the assert never acts as a speed cap. Only
 * specs use it.
 */
import type { CommandIntent } from '../../systems/authority/authorityCommand'
import { ARRIVAL_MONEY } from '../../systems/bot/paceArrival'
import type { SliceRun } from '../../systems/bot/playSlice'
import { CHOOSE_FORK_COMMAND, withoutPacingBotForkPicks } from '../tech-tree'
import { coreRunOn, coreTicksOf, median, PACE_SEEDS } from './drillGearPaceRuns'
import { DEEP_BRANCH } from './systems/drillGearFork'
import {
  deepTravelOf,
  type DeepTravel,
  TRAVEL_SHARE_CAP_BP,
  travelShareBpOf,
} from './systems/travelShare'

const RICH: CommandIntent = { type: 'debug.setMoney', payload: { amount: '1e30' } }
const ARRIVED: CommandIntent = { type: 'debug.setMoney', payload: { amount: ARRIVAL_MONEY } }
const CHOOSE_DEEP = {
  type: CHOOSE_FORK_COMMAND,
  payload: { lane: 'drill-gear', branch: DEEP_BRANCH },
} as CommandIntent

export const UNCHOSEN: readonly CommandIntent[] = [RICH, ARRIVED]
export const DEEP_CHOSEN: readonly CommandIntent[] = [RICH, CHOOSE_DEEP, ARRIVED]

/** "Measurably faster" (GD ruling on #392): the speed-up's floor. */
export const MEASURABLY_FASTER = 1.02
/**
 * One drill step of dig speed, x1.225 as the #255 lock writes it: past it is a balance finding.
 * Spelled as its ratio so the economy scan does not take it for the brass tracks' cost ratio.
 */
export const ONE_DRILL_STEP = 49 / 40

/** What the gates read of one planet's runs on every seed. */
export interface DeepPace {
  /** The median of the per-seed speed-ups, bare ticks over Deep ticks (#84). */
  speedUp: number
  /** Deep's travel on the medians of the seeds whose bare run reached the core (option (a)). */
  travel: DeepTravel
}

/** The two runs on every pacing seed, printed per seed, folded for the gates and the findings. */
export function deepPaceOn(planet: number): DeepPace {
  const seeds = PACE_SEEDS.map((seed) => seedPaceOn(planet, seed))
  const pace = foldSeedPaces(seeds)
  printPastOneDrillStep(planet, pace.speedUp)
  printTravelFinding(planet, seeds, pace.travel)
  return pace
}

function foldSeedPaces(seeds: readonly SeedPace[]): DeepPace {
  return {
    speedUp: median(seeds.map((seed) => seed.speedUp)),
    travel: travelOnMeasuredSeeds(seeds),
  }
}

/** A bare run that timed out never reached the core, so it has no share to compare (ruling 2). */
function travelOnMeasuredSeeds(seeds: readonly SeedPace[]): DeepTravel {
  const measured = seeds.filter(isBareMeasured)
  if (measured.length === 0) return 'unmeasured'
  const deepTravelBp = median(measured.map((seed) => seed.deepTravelBp))
  return deepTravelOf(deepTravelBp, median(measured.map((seed) => seed.bareTravelBp)))
}

/** The ceiling as the ruling words it: a balance finding for Systems, reported and never failed. */
function printPastOneDrillStep(planet: number, speedUp: number): void {
  if (speedUp <= ONE_DRILL_STEP) return
  console.warn(
    `P${planet}: balance finding for Systems: Deep's median speed-up ${speedUp} is past one drill step (x${ONE_DRILL_STEP})`,
  )
}

/** A bare run already over the cap leaves Deep ungated: the finding goes to #397's travel target. */
function printTravelFinding(planet: number, seeds: readonly SeedPace[], travel: DeepTravel): void {
  if (travel === 'unmeasured')
    console.warn(`P${planet}: no bare run reached the core: travel unmeasured`)
  if (travel !== 'bare_over_cap') return
  seeds.filter(isBareMeasured).forEach((seed) => console.warn(travelFindingLineOf(planet, seed)))
}

function travelFindingLineOf(planet: number, seed: MeasuredSeedPace): string {
  return (
    `P${planet} seed ${seed.seed}: finding for #397's travel target (${TRAVEL_SHARE_CAP_BP} bp): ` +
    `bare travel ${seed.bareTravelBp} bp, Deep ${seed.deepTravelBp} bp; Deep not gated`
  )
}

interface SeedPace {
  seed: number
  speedUp: number
  deepTravelBp: number
  /** Null when the bare run timed out before the core: unmeasured, never a share. */
  bareTravelBp: number | null
}

type MeasuredSeedPace = SeedPace & { bareTravelBp: number }

function isBareMeasured(seed: SeedPace): seed is MeasuredSeedPace {
  return seed.bareTravelBp !== null
}

function seedPaceOn(planet: number, seed: number): SeedPace {
  const bare = bareRunOn(planet, seed)
  const deep = coreRunOn(planet, seed, DEEP_CHOSEN)
  const [bareTicks, deepTicks] = [coreTicksOf(bare), coreTicksOf(deep)]
  const pace = {
    seed,
    speedUp: bareTicks / deepTicks,
    deepTravelBp: travelShareBpOf(deep.commands, 'p1', deepTicks),
    bareTravelBp: bare.isFinished ? travelShareBpOf(bare.commands, 'p1', bareTicks) : null,
  }
  console.log(`P${planet} seed ${seed}: unchosen ${bareTicks}, Deep ${deepTicks} ticks`, pace)
  return pace
}

/** The bot from arrival to the core without Deep: unchosen, and never choosing it on its own. */
function bareRunOn(planet: number, seed: number): SliceRun {
  return withoutPacingBotForkPicks(() => coreRunOn(planet, seed, UNCHOSEN))
}
