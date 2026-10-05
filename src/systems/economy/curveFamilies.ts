/**
 * The three curve families of decision #6 section 8 and #7: `geometric` (unbounded BigStat,
 * integer exponent only, #5 rule 1), `linear` (plain integer) and `saturating` (bounded number
 * that approaches `max`, using + - * / only so every machine computes the same double).
 */
import { mul, powInt, type BigStat } from '../money'
import type { BoundedRange } from './economyDefinition'

/** `start * ratio^steps`; `steps` is a level or a tier offset, never a fraction. */
export function growGeometric(start: BigStat, ratio: BigStat, steps: number): BigStat {
  return mul(start, compoundRatio(ratio, steps))
}

/** `ratio^steps`: a growth factor on its own, such as hardness `eta^(t-1)`. */
export function compoundRatio(ratio: BigStat, steps: number): BigStat {
  assertSteps(steps)
  return powInt(ratio, steps)
}

/** `start + step * steps`, for the plain-integer tracks (#6 section 1: energy and cargo). */
export function growLinear(start: number, step: number, steps: number): number {
  assertSteps(steps)
  return start + step * steps
}

/** `min + (max - min) * steps / (steps + halfSteps)` (#6 engine, #9 bounded enemy stats). */
export function saturate(range: BoundedRange, steps: number, halfSteps: number): number {
  assertSteps(steps)
  return range.min + ((range.max - range.min) * steps) / (steps + halfSteps)
}

function assertSteps(steps: number): void {
  if (!Number.isSafeInteger(steps) || steps < 0) {
    throw new RangeError(`a level or tier step must be a safe integer >= 0, got ${steps}`)
  }
}
