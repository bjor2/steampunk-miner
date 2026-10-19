/**
 * The stat of a stored step (#180 Systems pip rule, 6 Oct): every track evaluates its own curve at
 * the effective level `x = L + s * k / (n - 1)`, where the `n - 1` pips of a major share
 * `s = minorStatShare` of its gain and the big level-up gives the rest. With s = 1/2 and n = 10
 * that is `x = L + k/18`. At a major (k = 0) each kind computes exactly today's level `L`.
 *
 *   geometric  start * g^x, as `start * g^L * (g^(1/q))^(p*k)` with `p/q = s / (n - 1)`
 *   saturating min + (max - min) * x / (x + halfLevel), x as a fraction in lowest terms (the guns)
 *
 * A per-purchase track (drill power since the GD ruling on #551, ticket 552; the hold, the boiler
 * and the engine since ticket 553, Systems' rows on #553) skips the pip rule: every stored step is
 * one purchase of its own ratio.
 */
import {
  add,
  fromSafeInteger,
  mul,
  nthRoot,
  roundToWhole,
  toCanonical,
  toMillionthsNumber,
  toSafeInteger,
  type BigStat,
} from '../money'
import { compoundRatio, growGeometric, saturate } from './curveFamilies'
import { ECONOMY } from './economy'
import type {
  BoundedRange,
  EnginePerPurchaseEffect,
  GeometricEffect,
  PerPurchaseEffect,
  RatioRoot,
  WholePerPurchaseEffect,
} from './economyDefinition'
import type { EngineStats } from './vehicleStats'
import { majorOf, minorsPerMajor, pipOf } from './upgradeSteps'
import { lowestTerms, type WholeFraction } from '../wholeFractions'

export function geometricAtStep(effect: GeometricEffect, step: number): BigStat {
  const { numerator } = pipExponent()
  const atMajor = growGeometric(effect.start, effect.ratio, majorOf(step))
  return mul(atMajor, compoundRatio(pipRootOf(effect.ratio), numerator * pipOf(step)))
}

/** `start` at step 0, then `start * firstGain * ratio^(n - 1)` at purchase `n` (#551, 552). */
export function perPurchaseAtStep(effect: PerPurchaseEffect, step: number): BigStat {
  if (step === 0) return effect.start
  const afterFirst = growGeometric(effect.start, effect.ratio, step - 1)
  return mul(afterFirst, rootOf(effect.firstGain))
}

/**
 * `round(start * ratio^n)` after `n` purchases, ties to even: the hold's units and the boiler's
 * tank (ticket 553). A plain number past which it throws rather than round: the tank's quanta
 * (240 a unit) stay safe integers to purchase 275 (Systems' range on #553).
 */
export function wholePerPurchaseAtStep(effect: WholePerPurchaseEffect, step: number): number {
  return toSafeInteger(roundToWhole(growGeometric(effect.start, effect.ratio, step)))
}

/**
 * The engine after `e` purchases (ticket 553): every stat times `ratio^e`, worked out in decimals
 * and handed on as a bounded number for the physics step (#5 rule 5), with net lift on top of 1.
 */
export function enginePerPurchaseAtStep(
  effect: EnginePerPurchaseEffect,
  step: number,
): EngineStats {
  const growth = compoundRatio(effect.ratio, step)
  const { speedMax, accel, netLift } = effect.start
  return {
    speedMax: toMillionthsNumber(mul(speedMax, growth)),
    accel: toMillionthsNumber(mul(accel, growth)),
    thrustToWeight: toMillionthsNumber(add(fromSafeInteger(1), mul(netLift, growth))),
  }
}

/** `range` at the effective level of step `step`, `levelsBefore` majors not counted. */
export function saturatingAtStep(
  range: BoundedRange,
  halfLevel: number,
  step: number,
  levelsBefore = 0,
): number {
  const level = effectiveLevelOf(majorOf(step) - levelsBefore, pipOf(step))
  return saturate(range, level.numerator, halfLevel * level.denominator)
}

/** `L + k * p/q` as a fraction in lowest terms, so a major is the whole level `L` over 1. */
function effectiveLevelOf(level: number, pip: number): WholeFraction {
  const { numerator, denominator } = pipExponent()
  return lowestTerms(level * denominator + pip * numerator, denominator)
}

/** `p/q = s / (n - 1)`: the exponent one pip adds to the level. */
function pipExponent(): WholeFraction {
  const share = ECONOMY.upgradeTiers.minorStatShare
  return lowestTerms(share.numerator, share.denominator * (minorsPerMajor() - 1))
}

function pipRootOf(ratio: BigStat): BigStat {
  return rootOf({ ratio, root: pipExponent().denominator })
}

/** `ratio^(1/root)`, worked out once per ratio and root: `g^(1/q)` of a pip, a first gain. */
const ROOTS = new Map<string, BigStat>()

function rootOf({ ratio, root }: RatioRoot): BigStat {
  const key = `${toCanonical(ratio)}/${root}`
  const known = ROOTS.get(key)
  if (known !== undefined) return known
  const value = nthRoot(ratio, root)
  ROOTS.set(key, value)
  return value
}
