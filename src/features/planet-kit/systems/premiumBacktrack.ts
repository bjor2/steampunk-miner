/**
 * The ore-premium backtrack bar (ticket 826, PK7; Systems' row 4 of the GD lock of 24 Oct on
 * per-planet identity P1-P5): a backtrack haul plus round-trip fuel earns less than the frontier's
 * money per minute at every g from 2 to 10, so the premium never pays a player to go back.
 *
 * Read on the curve the fuel law stands in (`jumpFuel.ts`): a run on planet g sells R(g), the
 * median run's value. Going back from frontier g to g - 1 sells at most R(g - 1) with every unit at
 * the premium lift (the merchant pays it on one ore only, once per ore, so this is an upper bound)
 * and pays the jump there and back: `lift · R(g - 1) - Fee(g -> g-1) - Fee(g-1 -> g)`. Both are one
 * run's minutes, and the backtrack's two jumps only add to its own, so the bar holds when that net
 * is under R(g). The bot-measured side, a cleared planet's plain rate against the frontier's, is
 * the star map lane's (`starMapTravelBars.ts`).
 */
import { jumpFeeOf, runValueOf } from '../../../systems/economy/jumpFuel'
import {
  add,
  cmp,
  div,
  fromBigInt,
  mul,
  sub,
  toFixedText,
  type Money,
} from '../../../systems/money'
import { merchantPremiumLiftOf } from './merchantPremium'
import { PLANET_KITS } from './planetKitRows'

export const BACKTRACK_FRONTIERS = { first: 2, last: 10 } as const

/** One frontier's run value against the premium backtrack one planet behind it. */
export interface PremiumBacktrack {
  frontier: number
  frontierRun: Money
  /** The premium haul on planet `frontier - 1` less the jump there and back. */
  backtrackNet: Money
}

export function premiumBacktrackOf(frontier: number): PremiumBacktrack {
  const behind = frontier - 1
  const roundTrip = add(jumpFeeOf(frontier, behind), jumpFeeOf(behind, frontier))
  return {
    frontier,
    frontierRun: runValueOf(frontier),
    backtrackNet: sub(premiumHaulOn(behind), roundTrip),
  }
}

/** Every frontier from g = 2 to 10, in order. */
export function premiumBacktracks(): PremiumBacktrack[] {
  const { first, last } = BACKTRACK_FRONTIERS
  return Array.from({ length: last - first + 1 }, (_, at) => premiumBacktrackOf(first + at))
}

/** The frontiers where going back would earn as much as staying; empty when the bar holds. */
export function premiumBacktrackProblemsOf(backtracks: readonly PremiumBacktrack[]): string[] {
  return backtracks.flatMap(backtrackProblems)
}

function backtrackProblems({ frontier, frontierRun, backtrackNet }: PremiumBacktrack): string[] {
  if (cmp(backtrackNet, frontierRun) < 0) return []
  return [
    `g ${frontier}: a premium backtrack nets ${toFixedText(backtrackNet, 1)} a run, ` +
      `not under the frontier's ${toFixedText(frontierRun, 1)}`,
  ]
}

/** A whole run on `planet` sold at the merchant's premium lift. */
function premiumHaulOn(planet: number): Money {
  const { num, den } = merchantPremiumLiftOf(PLANET_KITS)
  return div(mul(runValueOf(planet), fromBigInt(num)), fromBigInt(den))
}
