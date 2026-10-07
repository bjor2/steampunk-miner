/**
 * How many coins a sale's burst shows (#171 section 1, made exact by the TD lock on #176, ticket
 * 220): `clamp(round(4·log2(1 + proceeds / nextStepPrice)), 3, 40)`. Authority has no `log2`, so
 * each count is a Money compare instead: with `y = (price + proceeds) / price`,
 * `round(4·log2 y) >= k  <=>  y^8 >= 2^(2k-1)  <=>  (price + proceeds)^8 >= 2^(2k-1) · price^8`.
 * `2^((2k-1)/8)` is irrational, so a sale never lands on a tie.
 */
import { UPGRADE_IDS } from '../economy/economyDefinition'
import { add, cmp, fromSafeInteger, mul, powInt, type Money } from '../money'
import type { AuthorityState } from './authorityState'
import { nextUpgradePrice } from './workshopRules'

/** #171: a burst never shows fewer than 3 coins, nor more than 40. */
const FEWEST_COINS = 3
const MOST_COINS = 40

/** Each count past the fewest, in order; each needs a higher power of the sale than the last. */
const COUNTS_PAST_FEWEST: readonly number[] = Array.from(
  { length: MOST_COINS - FEWEST_COINS },
  (_, index) => FEWEST_COINS + 1 + index,
)

const TWO = fromSafeInteger(2)

/** The burst's coin count for a sale of `proceeds` while the next step costs `nextStepPrice`. */
export function coinsShownOf(proceeds: Money, nextStepPrice: Money): number {
  const salePower = powInt(add(nextStepPrice, proceeds), 8)
  const pricePower = powInt(nextStepPrice, 8)
  const reached = COUNTS_PAST_FEWEST.filter((count) => reachesCount(salePower, pricePower, count))
  return FEWEST_COINS + reached.length
}

/**
 * The step a sale is measured in: until #181 brings steps, the cheapest next whole level among the
 * six Workshop tracks (TD lock on #176). No track has a level cap today, so every track counts.
 * Expect about 13 times the coins once #181 makes a step roughly a tenth of a level.
 */
export function nextStepPriceOf(state: AuthorityState, playerId: string): Money {
  return UPGRADE_IDS.map((upgradeId) => nextUpgradePrice(state, playerId, upgradeId)).reduce(
    cheaperOf,
  )
}

function reachesCount(salePower: Money, pricePower: Money, count: number): boolean {
  return cmp(salePower, mul(powInt(TWO, 2 * count - 1), pricePower)) >= 0
}

function cheaperOf(a: Money, b: Money): Money {
  return cmp(b, a) < 0 ? b : a
}
