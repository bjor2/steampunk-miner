/**
 * The casing grade's price (#41 Systems & Economy): the buy that raises grade `G` to `G + 1`
 * costs `ceil(48 * 1.24^(G-1))`, so grades 1->2 .. 4->5 cost 48, 60, 74 and 92 (274 together).
 * The base and ratio are `cost.casing.upgrade` in `economy.json`; there is no pace scale in the
 * formula, as the decision writes it.
 *
 * Lining is charged on first placement only (#76, #85): `ceilMilli(k_casing * V(t(p,b)) * lengthM)`
 * for `lengthM` metres of new lining against band `b`'s rock on planet `p`. The grade does not
 * multiply it (grade only gates collapse) and relining is free, so no grade enters the formula.
 */
import { ceil, ceilMilli, mul, type BigStat, type Money } from '../money'
import { growGeometric } from './curveFamilies'
import { ECONOMY } from './economy'
import { oreTier, oreValue } from './oreEconomy'

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

/** What `lengthM` metres of first-placed lining cost against band `band`'s wall on planet `planetIndex`. */
export function casingLiningPrice(planetIndex: number, band: number, lengthM: BigStat): Money {
  const metrePrice = mul(ECONOMY.casing.kCasing, oreValue(oreTier(planetIndex, band)))
  return ceilMilli(mul(metrePrice, lengthM))
}
