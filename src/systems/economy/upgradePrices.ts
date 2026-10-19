/**
 * The six `cost.vehicle.*` price curves (decision #6 section 3): the price of level L -> L+1 is
 * `ceil(base * ratio^L)` as a whole-number Money, times `paceScale(p)` (default 1). Since #180 that
 * is the price of a major level, paid in `minorsPerMajor` steps (`upgradeSteps.ts`).
 *
 * Drill power is priced per purchase with no major split (the GD ruling on #551, ticket 552):
 * `price(0) = 1`, `price(n) = ceil(20 * 1.48^(n - 1))`, each times `paceScale(p)`, so a price
 * on a planet whose scale is not whole carries the scale's decimals. The hold, the boiler and the
 * engine are too (Systems' rows on #553, ticket 553): `ceil(2.4 * 1.20^n)` for the hold and the
 * boiler and `ceil(3.6 * 1.60^e)` for the engine, times `paceScale(p)`.
 */
import { ceil, mul, type Money } from '../money'
import {
  geometricCurveOf,
  geometricWorthAt,
  perPurchaseCurveOf,
  perPurchaseRowAt,
} from './costCurveLookup'
import { ECONOMY } from './economy'
import type { UpgradeId } from './economyDefinition'
import { paceScale } from './planetEconomy'
import { isPerPurchaseTrack, majorOf, pipOf, stepPriceWithin } from './upgradeSteps'

/**
 * What the workshop charges on planet `planetIndex` to raise `upgradeId` from `level`: a major's
 * price, or one purchase on a per-purchase track, whose level is its step.
 */
export function upgradePrice(upgradeId: UpgradeId, level: number, planetIndex: number): Money {
  if (isPerPurchaseTrack(upgradeId)) return purchasePrice(upgradeId, level, planetIndex)
  return ceil(upgradeWorth(upgradeId, level, planetIndex))
}

/** The price of the step bought from stored step `step`: one pip, the big level-up or a purchase. */
export function stepPrice(upgradeId: UpgradeId, step: number, planetIndex: number): Money {
  if (isPerPurchaseTrack(upgradeId)) return purchasePrice(upgradeId, step, planetIndex)
  return pipPrice(upgradeId, step, planetIndex)
}

/** The curve a track is priced by, as its definition names it (#7 `UpgradeDef.costCurveId`). */
export function costCurveIdOf(upgradeId: UpgradeId): string {
  const upgrade = ECONOMY.upgrades.find((candidate) => candidate.id === upgradeId)
  if (upgrade === undefined) throw new RangeError(`no upgrade ${upgradeId}`)
  return upgrade.costCurveId
}

function pipPrice(upgradeId: UpgradeId, step: number, planetIndex: number): Money {
  const { ratio } = geometricCurveOf(costCurveIdOf(upgradeId))
  const worth = upgradeWorth(upgradeId, majorOf(step), planetIndex)
  return stepPriceWithin(worth, ratio, pipOf(step), ceil)
}

/** The row of purchase `purchase` times the planet's `paceScale`. */
function purchasePrice(upgradeId: UpgradeId, purchase: number, planetIndex: number): Money {
  const row = perPurchaseRowAt(perPurchaseCurveOf(costCurveIdOf(upgradeId)), purchase)
  return mul(row, paceScale(planetIndex))
}

/** `base * ratio^L * paceScale(p)` before rounding: the `X_L` the steps of a major split. */
function upgradeWorth(upgradeId: UpgradeId, level: number, planetIndex: number): Money {
  const curve = geometricCurveOf(costCurveIdOf(upgradeId))
  return mul(geometricWorthAt(curve, level), paceScale(planetIndex))
}
