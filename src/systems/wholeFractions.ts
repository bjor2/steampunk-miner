/**
 * Fractions of whole numbers, so the pip rules of #180 stay in integers: an effective level
 * `L + k * p/q` in lowest terms, and a pip gain rounded half up with no float in between.
 */
export interface WholeFraction {
  numerator: number
  denominator: number
}

export function lowestTerms(numerator: number, denominator: number): WholeFraction {
  const divisor = greatestCommonDivisor(numerator, denominator)
  return { numerator: numerator / divisor, denominator: denominator / divisor }
}

/** `numerator / denominator` to the nearest whole number, a half rounded up; both whole, >= 0. */
export function roundHalfUp(numerator: number, denominator: number): number {
  return Math.floor((2 * numerator + denominator) / (2 * denominator))
}

/** A non-negative number to the nearest whole number, a half rounded up. */
export function roundHalfUpNumber(value: number): number {
  return Math.floor(value + 1 / 2)
}

function greatestCommonDivisor(a: number, b: number): number {
  return b === 0 ? a : greatestCommonDivisor(b, a % b)
}
