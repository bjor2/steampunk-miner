/**
 * The six `cost.vehicle.*` price curves (decision #6 section 3): the price of level L -> L+1 is
 * `ceil(base * ratio^L)` as a whole-number Money, times `paceScale(p)` (default 1). Since #180 that
 * is the price of a major level, paid in `minorsPerMajor` steps (`upgradeSteps.ts`). A curve in
 * pieces (drill power, Systems' front-loaded rows on ticket 396) prices each major on the piece it
 * falls in, and splits it into steps at that piece's ratio.
 */
import { ceil, mul, type Money } from '../money'
import { geometricCurveOf, geometricPieceAt, geometricWorthAt } from './costCurveLookup'
import { ECONOMY } from './economy'
import type { UpgradeId } from './economyDefinition'
import { paceScale } from './planetEconomy'
import { majorOf, pipOf, stepPriceWithin } from './upgradeSteps'

/** What the workshop charges on planet `planetIndex` to raise `upgradeId` from major `level`. */
export function upgradePrice(upgradeId: UpgradeId, level: number, planetIndex: number): Money {
  return ceil(upgradeWorth(upgradeId, level, planetIndex))
}

/** The price of the step bought from stored step `step`: one pip, or the big level-up. */
export function stepPrice(upgradeId: UpgradeId, step: number, planetIndex: number): Money {
  const level = majorOf(step)
  const { ratio } = geometricPieceAt(geometricCurveOf(costCurveIdOf(upgradeId)), level)
  const worth = upgradeWorth(upgradeId, level, planetIndex)
  return stepPriceWithin(worth, ratio, pipOf(step), ceil)
}

/** The curve a track is priced by, as its definition names it (#7 `UpgradeDef.costCurveId`). */
export function costCurveIdOf(upgradeId: UpgradeId): string {
  const upgrade = ECONOMY.upgrades.find((candidate) => candidate.id === upgradeId)
  if (upgrade === undefined) throw new RangeError(`no upgrade ${upgradeId}`)
  return upgrade.costCurveId
}

/** `base * ratio^L * paceScale(p)` before rounding: the `X_L` the steps of a major split. */
function upgradeWorth(upgradeId: UpgradeId, level: number, planetIndex: number): Money {
  const curve = geometricCurveOf(costCurveIdOf(upgradeId))
  return mul(geometricWorthAt(curve, level), paceScale(planetIndex))
}
