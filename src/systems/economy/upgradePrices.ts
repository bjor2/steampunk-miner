/**
 * The six `cost.vehicle.*` price curves (decision #6 section 3): the price of level L -> L+1 is
 * `ceil(base * ratio^L)` as a whole-number Money, times `paceScale(p)` (default 1).
 */
import { ceil, mul, type Money } from '../money'
import { growGeometric } from './curveFamilies'
import { ECONOMY } from './economy'
import type { CostCurve, UpgradeId } from './economyDefinition'
import { paceScale } from './planetEconomy'

/** What the workshop charges on planet `planetIndex` to raise `upgradeId` from `level`. */
export function upgradePrice(upgradeId: UpgradeId, level: number, planetIndex: number): Money {
  const curve = costCurveOf(upgradeId)
  return ceil(mul(growGeometric(curve.base, curve.ratio, level), paceScale(planetIndex)))
}

/** The curve a track is priced by, as its definition names it (#7 `UpgradeDef.costCurveId`). */
export function costCurveIdOf(upgradeId: UpgradeId): string {
  const upgrade = ECONOMY.upgrades.find((candidate) => candidate.id === upgradeId)
  if (upgrade === undefined) throw new RangeError(`no upgrade ${upgradeId}`)
  return upgrade.costCurveId
}

function costCurveOf(upgradeId: UpgradeId): CostCurve {
  const curveId = costCurveIdOf(upgradeId)
  const curve = ECONOMY.costCurves.find((candidate) => candidate.id === curveId)
  if (curve === undefined) throw new RangeError(`no cost curve ${curveId}`)
  return curve
}
