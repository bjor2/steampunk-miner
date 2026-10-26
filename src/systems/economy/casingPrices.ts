/**
 * The casing grade's price (#41 Systems & Economy, the ladder of ticket 829): unlocking grade `q`
 * up to the first planet's bottom grade (5) costs `ceil(240 * 1.225^(q-2))`, so grades 2 .. 5 cost
 * 240, 294, 361 and 442 (1337 together; #195 gave it drill power's ratio, #894 raised the base from
 * 48 to 240 and kept it). Past it a grade costs `price(5) * r^(q-5)` with
 * `r = planetPriceRatio^(1/gradesPerPlanet)` = `3.375^(1/4)`, so the ladder's four grades a planet
 * cost 3.375 times the planet before's, in step with income, with no V(t_top(g)) factor (the VS).
 * The base and ratio are `cost.casing.upgrade` in `economy.json`; there is no pace scale in the
 * formula, as the decision writes it.
 *
 * Lining is charged on first placement only (#76, #85), per metre of the cut whatever its width:
 * against a wall needing grade `q` up to 5, `ceilMilli(k_casing * V(t(p,b)) * lengthM)` for band
 * `b`'s rock on planet `p`, main's charge unchanged; past 5 grade 5's metre (planet 1's band 5)
 * times `r^(q-5)`. The grade the rig lays does not multiply it, only the grade the wall needs, and
 * relining is free.
 *
 * A hazard lining type is a casing_cement grade (ticket 366, `casingCementGrades.ts`), unlocked
 * once at the Upgrade bay for its grade's price on the non-drill Mark curve; the standard lining
 * is free. These cement grades are not the #41 casing grade above.
 */
import { countAsSafeInteger } from '../wholeCount'
import {
  add,
  ceil,
  ceilMilli,
  div,
  fromSafeInteger,
  mul,
  powRatio,
  ZERO_MONEY,
  type BigStat,
  type Money,
} from '../money'
import { bandOrePrice } from './bandOreCost'
import { cementGradeCountOf, cementGradeOfType, cementGradeOreCostOf } from './casingCementGrades'
import { ladderDepthOf, requiredCasingGrade } from './casingGrades'
import { geometricCurveOf } from './costCurveLookup'
import { compoundRatio, growGeometric } from './curveFamilies'
import { ECONOMY } from './economy'
import { liningTypePriceMultiplier, STANDARD_LINING_TYPE } from './heatEconomy'
import { oreTier, oreValue } from './oreEconomy'

const FIRST_PLANET = 1
/** The first grade bought: the curve's base is grade 2's price, one grade above the start. */
const ONE_GRADE = BigInt(1)
const FIRST_BOUGHT_GRADE = BigInt(ECONOMY.casing.casingGradeStart) + ONE_GRADE

/**
 * The first planet's bottom grade on the default ladder (5): main's prices hold up to it, the
 * ladder's ratio past it.
 */
export const LADDER_ANCHOR_GRADE =
  BigInt(ECONOMY.casing.casingGradeStart) + BigInt(ladderDepthOf(ECONOMY.ore.coreTierBand))

/** The first planet's band whose wall needs the anchor grade: its last ore band. */
const ANCHOR_BAND = ECONOMY.ore.coreTierBand - 1

/** What the Upgrade bay charges to raise the casing from `grade` to the next one. */
export function casingUpgradePrice(grade: bigint): Money {
  return casingUnlockPrice(grade + ONE_GRADE)
}

/**
 * The price of unlocking grade `grade`: nothing for the grade every vehicle starts with, main's
 * curve up to the anchor, `r` a grade past it.
 */
export function casingUnlockPrice(grade: bigint): Money {
  if (grade <= casingGradeStart()) return ZERO_MONEY
  if (grade > LADDER_ANCHOR_GRADE) {
    return ceil(mul(casingUnlockPrice(LADDER_ANCHOR_GRADE), gradeRatioOver(grade)))
  }
  const curve = geometricCurveOf(ECONOMY.casing.costCurveId)
  return ceil(
    growGeometric(curve.base, curve.ratio, countAsSafeInteger(grade - FIRST_BOUGHT_GRADE)),
  )
}

/** Every grade above `owned` up to `wanted`, summed: what a catch-up at the dock costs. */
export function casingCatchUpPrice(owned: bigint, wanted: bigint): Money {
  let total = ZERO_MONEY
  for (let grade = owned + ONE_GRADE; grade <= wanted; grade++)
    total = add(total, casingUnlockPrice(grade))
  return total
}

/** The grade every vehicle starts with: band 1 is lined from the first undock (#41). */
export function casingGradeStart(): bigint {
  return BigInt(ECONOMY.casing.casingGradeStart)
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
  const typedPrice = mul(liningMetrePrice(planetIndex, band), liningTypePriceMultiplier(liningType))
  return ceilMilli(mul(typedPrice, lengthM))
}

/**
 * A metre of the standard lining against band `band`'s wall on planet `planetIndex`, priced by the
 * grade the wall needs: main's band charge up to the anchor, past it the anchor band's times `r`
 * a grade.
 */
export function liningMetrePrice(planetIndex: number, band: number): Money {
  const grade = requiredCasingGrade({ planetIndex, band })
  if (grade <= LADDER_ANCHOR_GRADE) return bandMetrePrice(planetIndex, band)
  return mul(bandMetrePrice(FIRST_PLANET, ANCHOR_BAND), gradeRatioOver(grade))
}

function bandMetrePrice(planetIndex: number, band: number): Money {
  return mul(ECONOMY.casing.kCasing, oreValue(oreTier(planetIndex, band)))
}

/**
 * `r^(q - 5)` as whole planets of `planetPriceRatio` times the rest's root, so every fourth grade
 * is exactly 3.375 times the one a planet before, with no drift over a million planets.
 */
function gradeRatioOver(grade: bigint): BigStat {
  const { gradesPerPlanet, planetPriceRatio } = ECONOMY.casing
  const steps = grade - LADDER_ANCHOR_GRADE
  const perPlanet = BigInt(gradesPerPlanet)
  const whole = compoundRatio(planetPriceRatio, countAsSafeInteger(steps / perPlanet))
  const rest = countAsSafeInteger(steps % perPlanet)
  if (rest === 0) return whole
  const share = div(fromSafeInteger(rest), fromSafeInteger(gradesPerPlanet))
  return mul(whole, powRatio(planetPriceRatio, share))
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
