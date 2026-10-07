/**
 * Two-tier upgrade levels and chain pricing (#180 sections 3 and 4, Systems, with the TD survey
 * and the Systems pip rule of 6 Oct): each track stores one integer, its **step** `m = n*L + k`,
 * with `n = minorsPerMajor` (10). `L = floor(m / n)` is the **major** level of today's curves and
 * `k` the pip toward the next one; the `n`th step of a major is its big level-up.
 *
 * A major worth `X_L` (today's level price before rounding) is split into `n` step prices by
 * running totals: step `k` costs `T(k + 1) - T(k)` with `T(k) = up(X_L * F(k))`,
 * `F(k) = (rho^k - 1) / (rho^n - 1)` and `rho = ratio^(1/n)`, so every step costs more than the
 * last. The last step is the remainder `up(X_L) - (steps 0 .. n-2)`, so the steps of a major sum
 * to exactly today's level price at any size, also past 1e37 where a difference of 40-digit
 * running totals would lose low digits (TD, #181). `up` is `ceil` for the brass and drill tracks
 * and `ceilMilli` for the guns, whose prices are in the money quantum.
 */
import {
  add,
  div,
  fromSafeInteger,
  mul,
  nthRoot,
  sub,
  toCanonical,
  ZERO_MONEY,
  type Money,
} from '../money'
import { compoundRatio } from './curveFamilies'
import { ECONOMY } from './economy'
import { UPGRADE_IDS, type UpgradeId } from './economyDefinition'

/** Per track, the stored step; or per track, a major level (`levelsOfSteps`). */
export type TrackNumbers = Readonly<Record<UpgradeId, number>>

/** How a running total is rounded up to a price: whole money, or the 0.001 quantum. */
export type PriceRounding = (amount: Money) => Money

export function minorsPerMajor(): number {
  return ECONOMY.upgradeTiers.minorsPerMajor
}

/** The major level a step is in: today's level `L`. */
export function majorOf(step: number): number {
  return Math.floor(step / minorsPerMajor())
}

/** The pip `k` of a step inside its major, 0 at the major itself. */
export function pipOf(step: number): number {
  return step % minorsPerMajor()
}

/** The step a major level starts on: an old save's level `L` is step `n*L`. */
export function stepOfMajor(level: number): number {
  return level * minorsPerMajor()
}

/** Whether buying from `step` lands a major: the big level-up. */
export function isMajorStep(step: number): boolean {
  return pipOf(step) === minorsPerMajor() - 1
}

export function stepsOfMajors(levels: TrackNumbers): TrackNumbers {
  return mapTracks(levels, stepOfMajor)
}

export function majorsOfSteps(steps: TrackNumbers): TrackNumbers {
  return mapTracks(steps, majorOf)
}

/**
 * The price of the step bought from pip `pip` of a major worth `worth` (unrounded), on a price
 * curve of ratio `ratio`.
 */
export function stepPriceWithin(
  worth: Money,
  ratio: Money,
  pip: number,
  roundUp: PriceRounding,
): Money {
  const lastPip = minorsPerMajor() - 1
  if (pip === lastPip) return sub(roundUp(worth), pricesBeforePip(worth, ratio, lastPip, roundUp))
  return sub(runningTotal(worth, ratio, pip + 1, roundUp), runningTotal(worth, ratio, pip, roundUp))
}

/** The sum of the step prices of pips `0 .. pip - 1`, added in order. */
function pricesBeforePip(worth: Money, ratio: Money, pip: number, roundUp: PriceRounding): Money {
  let total = ZERO_MONEY
  for (let before = 0; before < pip; before++) {
    total = add(total, stepPriceWithin(worth, ratio, before, roundUp))
  }
  return total
}

/** `T(k) = up(X * F(k))`, with `T(0) = 0`. */
function runningTotal(worth: Money, ratio: Money, pip: number, roundUp: PriceRounding): Money {
  return roundUp(mul(worth, sharesBeforePips(ratio)[pip]))
}

/** `F(0) .. F(n)`, worked out once per ratio: the share of a major the first `k` steps cost. */
const SHARES_BEFORE_PIPS = new Map<string, readonly Money[]>()

function sharesBeforePips(ratio: Money): readonly Money[] {
  const key = toCanonical(ratio)
  const known = SHARES_BEFORE_PIPS.get(key)
  if (known !== undefined) return known
  const shares = sharesOfRoot(nthRoot(ratio, minorsPerMajor()))
  SHARES_BEFORE_PIPS.set(key, shares)
  return shares
}

/** `F(k) = (rho^k - 1) / (rho^n - 1)` for k = 0 .. n. */
function sharesOfRoot(root: Money): Money[] {
  const one = fromSafeInteger(1)
  const whole = sub(compoundRatio(root, minorsPerMajor()), one)
  return Array.from({ length: minorsPerMajor() + 1 }, (_, pip) =>
    div(sub(compoundRatio(root, pip), one), whole),
  )
}

function mapTracks(values: TrackNumbers, map: (value: number) => number): TrackNumbers {
  const entries = UPGRADE_IDS.map((upgradeId) => [upgradeId, map(values[upgradeId])] as const)
  return Object.fromEntries(entries) as Record<UpgradeId, number>
}
