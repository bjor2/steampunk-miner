/**
 * The casing grade's price (#41 Systems & Economy): the buy that raises grade `G` to `G + 1`
 * costs `ceil(48 * 1.24^(G-1))`, so grades 1->2 .. 4->5 cost 48, 60, 74 and 92 (274 together).
 * The base and ratio are `cost.casing.upgrade` in `economy.json`; there is no pace scale in the
 * formula, as the decision writes it.
 */
import { ceil, type Money } from '../money'
import { growGeometric } from './curveFamilies'
import { ECONOMY } from './economy'

/** What the Upgrade bay charges to raise the casing from `grade` to the next one. */
export function casingUpgradePrice(grade: number): Money {
  const curve = ECONOMY.costCurves.find((candidate) => candidate.id === ECONOMY.casing.costCurveId)
  if (curve === undefined) throw new RangeError(`no cost curve ${ECONOMY.casing.costCurveId}`)
  return ceil(growGeometric(curve.base, curve.ratio, grade - 1))
}

/** The grade every vehicle starts with: band 1 is lined from the first undock (#41). */
export function casingGradeStart(): number {
  return ECONOMY.casing.casingGradeStart
}
