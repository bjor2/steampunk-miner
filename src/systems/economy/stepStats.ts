/**
 * The stat of a stored step (#180 Systems pip rule, 6 Oct): every track evaluates its own curve at
 * the effective level `x = L + s * k / (n - 1)`, where the `n - 1` pips of a major share
 * `s = minorStatShare` of its gain and the big level-up gives the rest. With s = 1/2 and n = 10
 * that is `x = L + k/18`. At a major (k = 0) each kind computes exactly today's level `L`.
 *
 *   geometric  start * g^x, as `start * g^L * (g^(1/q))^(p*k)` with `p/q = s / (n - 1)`
 *   linear     start + step * L + round half up(step * k * p/q), in integers only, so cargo and
 *              boiler stay whole numbers that no pip rounding of a geometric value ever made
 *   saturating min + (max - min) * x / (x + halfLevel), x as a fraction in lowest terms
 */
import { mul, nthRoot, toCanonical, type BigStat } from '../money'
import { compoundRatio, growGeometric, growLinear, saturate } from './curveFamilies'
import { ECONOMY } from './economy'
import type { BoundedRange, GeometricEffect, LinearEffect } from './economyDefinition'
import { majorOf, minorsPerMajor, pipOf } from './upgradeSteps'
import { lowestTerms, roundHalfUp, type WholeFraction } from '../wholeFractions'

export function geometricAtStep(effect: GeometricEffect, step: number): BigStat {
  const { numerator } = pipExponent()
  const atMajor = growGeometric(effect.start, effect.ratio, majorOf(step))
  return mul(atMajor, compoundRatio(pipRootOf(effect.ratio), numerator * pipOf(step)))
}

export function linearAtStep(effect: LinearEffect, step: number): number {
  const { numerator, denominator } = pipExponent()
  const pipGain = roundHalfUp(effect.step * numerator * pipOf(step), denominator)
  return growLinear(effect.start, effect.step, majorOf(step)) + pipGain
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

/** `g^(1/q)`, worked out once per stat ratio. */
const PIP_ROOTS = new Map<string, BigStat>()

function pipRootOf(ratio: BigStat): BigStat {
  const key = toCanonical(ratio)
  const known = PIP_ROOTS.get(key)
  if (known !== undefined) return known
  const root = nthRoot(ratio, pipExponent().denominator)
  PIP_ROOTS.set(key, root)
  return root
}
