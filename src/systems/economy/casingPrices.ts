/**
 * The casing grade's price (#41 Systems & Economy): the buy that raises grade `G` to `G + 1`
 * costs `ceil(48 * 1.225^(G-1))`, so grades 1->2 .. 4->5 cost 48, 59, 73 and 89 (269 together;
 * #195 gave it drill power's ratio).
 * The base and ratio are `cost.casing.upgrade` in `economy.json`; there is no pace scale in the
 * formula, as the decision writes it.
 *
 * Lining is charged on first placement only (#76, #85): `ceilMilli(k_casing * V(t(p,b)) * lengthM)`
 * for `lengthM` metres of new lining against band `b`'s rock on planet `p`. The grade does not
 * multiply it (grade only gates collapse) and relining is free, so no grade enters the formula.
 *
 * A hazard lining type is a casing_cement grade (ticket 366, `casingCementGrades.ts`), unlocked
 * once at the Upgrade bay for its grade's price on the non-drill Mark curve; the standard lining
 * is free. These cement grades are not the #41 casing grade above.
 */
import { ceil, ceilMilli, mul, ZERO_MONEY, type BigStat, type Money } from '../money'
import { bandOrePrice } from './bandOreCost'
import { cementGradeCountOf, cementGradeOfType, cementGradeOreCostOf } from './casingCementGrades'
import { geometricCurveOf } from './costCurveLookup'
import { growGeometric } from './curveFamilies'
import { ECONOMY } from './economy'
import { liningTypePriceMultiplier, STANDARD_LINING_TYPE } from './heatEconomy'
import { oreTier, oreValue } from './oreEconomy'

/** What the Upgrade bay charges to raise the casing from `grade` to the next one. */
export function casingUpgradePrice(grade: number): Money {
  const curve = geometricCurveOf(ECONOMY.casing.costCurveId)
  return ceil(growGeometric(curve.base, curve.ratio, grade - 1))
}

/** The grade every vehicle starts with: band 1 is lined from the first undock (#41). */
export function casingGradeStart(): number {
  return ECONOMY.casing.casingGradeStart
}

/**
 * What `lengthM` metres of first-placed lining cost against band `band`'s wall on planet
 * `planetIndex`, in the lining type `liningType`: a type's multiplier scales the metre price
 * (#113: refractory is 1.5 times it), the standard lining's is 1.
 */
export function casingLiningPrice(
  planetIndex: number,
  band: number,
  lengthM: BigStat,
  liningType: string = STANDARD_LINING_TYPE,
): Money {
  const metrePrice = mul(ECONOMY.casing.kCasing, oreValue(oreTier(planetIndex, band)))
  const typedPrice = mul(metrePrice, liningTypePriceMultiplier(liningType))
  return ceilMilli(mul(typedPrice, lengthM))
}

/** How many casing_cement grades there are (ticket 366): a fixed count. */
export function cementGradeCount(): number {
  return cementGradeCountOf(ECONOMY.casing.cementGrades)
}

/** The casing_cement grade `liningType` is, 1 first; null for the standard lining. */
export function cementGradeOf(liningType: string): number | null {
  return cementGradeOfType(ECONOMY.casing.cementGrades, liningType)
}

/** What casing_cement grade `grade` costs at the Upgrade bay of planet `planetIndex`. */
export function cementGradePrice(grade: number, planetIndex: number): Money {
  return bandOrePrice(cementGradeOreCostOf(ECONOMY.casing.cementGrades, grade), planetIndex)
}

/** Unlocking a lining type on planet `planetIndex`: its grade's price, the standard one free. */
export function liningTypeUnlockPrice(liningType: string, planetIndex: number): Money {
  const grade = cementGradeOf(liningType)
  return grade === null ? ZERO_MONEY : cementGradePrice(grade, planetIndex)
}
