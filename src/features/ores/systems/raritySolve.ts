/**
 * The spawn-weight solver (Systems on #139, comment 6202970624 section 2; ticket 445): per band,
 *
 *   w_k = c_b * m_k^-alpha        m_k = valueRatio^k        alpha = 2
 *
 * with `c_b` chosen so the mean value of one ore unit stays today's:
 *
 *   sum_k w_k * m_k + sig * m_sig = 10000 * mu_b        (common weight = 10000 - sig - sum_{k>=1} w_k)
 *
 * Every tier above the lowest live one is rounded to whole basis points, and the lowest is fitted
 * last against what they left. Rounding runs in whole fractions, so no float decides a weight; a
 * fitted weight exactly halfway rounds down, so a tie never adds income. The mean is exact in
 * Money, since every `1.5^k` is a finite decimal.
 */
import { ECONOMY } from '../../../systems/economy/economy'
import {
  add,
  cmp,
  floor,
  fromSafeInteger,
  mul,
  toSafeInteger,
  type Money,
} from '../../../systems/money'
import { lowestTerms, type WholeFraction } from '../../../systems/wholeFractions'
import { ORE_ROWS, type OreRows } from './oreRows'
import { rarityMultiplierOf } from './rarityTiers'

/** What one band's solve needs. */
export interface RaritySolveBand {
  /** Today's mean value of one ore unit of the band, in ppm of `V(t_b)`. */
  meanPpm: number
  /** The tier offsets above common the band draws, ascending. */
  liveOffsets: readonly number[]
  /** Basis points of the band's ore that wear the planet's signature (#141), carved from common. */
  signatureBp: number
  /** The tier the signature sells at, above the band's own (`t_5 + 1` over `t_b`). */
  signatureOffset: number
}

const BASIS_POINTS = 10000
const PPM_PER_BASIS_POINT = 100
const DECIMAL_BASE = 10
const ONE: WholeFraction = { numerator: 1, denominator: 1 }

/** Weights in basis points by tier offset, common first (common carries what the rest leave). */
export function solvedRarityWeightsBp(band: RaritySolveBand, rows: OreRows = ORE_ROWS): number[] {
  if (band.liveOffsets.length === 0) return weightsByOffset(band, rows, [])
  const ratio = valueRatioFraction()
  const excess = excessOverCommonBp(band, ratio)
  const scale = over(excess, weightedLiftOf(band.liveOffsets, ratio, rows.rarity.alpha))
  const upper = upperWeightsBp(band.liveOffsets.slice(1), scale, ratio, rows.rarity.alpha)
  const lowest = fittedLowestWeightBp(band.liveOffsets[0], excess, upper, ratio)
  return weightsByOffset(band, rows, [...lowest, ...upper])
}

/**
 * `sum_k w_k * m_k + sig * m_sig` in basis points of `V(t_b)`, exact: what one ore unit of the band
 * is worth on average, times 10000. `weightsBp` is by tier offset, common first.
 */
export function bandMeanValueBpOf(
  weightsBp: readonly number[],
  signatureBp: number,
  signatureOffset: number,
): Money {
  const signature = mul(fromSafeInteger(signatureBp), rarityMultiplierOf(signatureOffset))
  return weightsBp
    .map((weight, offset) => mul(fromSafeInteger(weight), rarityMultiplierOf(offset)))
    .reduce(add, signature)
}

/** `10000 * (mu_b - 1) - sig * (m_sig - 1)`: the lift the tiers above common must carry. */
function excessOverCommonBp(band: RaritySolveBand, ratio: WholeFraction): WholeFraction {
  const mean = ratioOf(band.meanPpm - BASIS_POINTS * PPM_PER_BASIS_POINT, PPM_PER_BASIS_POINT)
  const signatureLift = minus(powerOf(ratio, band.signatureOffset), ONE)
  return minus(mean, times(ratioOf(band.signatureBp, 1), signatureLift))
}

/** `sum_k m_k^-alpha * (m_k - 1)`: the lift one unit of `c_b` buys. */
function weightedLiftOf(
  offsets: readonly number[],
  ratio: WholeFraction,
  alpha: number,
): WholeFraction {
  return offsets
    .map((offset) => times(shapeOf(offset, ratio, alpha), liftOf(offset, ratio)))
    .reduce(plus, ratioOf(0, 1))
}

function upperWeightsBp(
  offsets: readonly number[],
  scale: WholeFraction,
  ratio: WholeFraction,
  alpha: number,
): [number, number][] {
  return offsets.map((offset) => [
    offset,
    roundHalfDown(times(scale, shapeOf(offset, ratio, alpha))),
  ])
}

/** The lowest live tier carries whatever lift the rounded upper tiers left. */
function fittedLowestWeightBp(
  offset: number,
  excess: WholeFraction,
  upper: readonly [number, number][],
  ratio: WholeFraction,
): [number, number][] {
  const carried = upper
    .map(([upperOffset, weight]) => times(ratioOf(weight, 1), liftOf(upperOffset, ratio)))
    .reduce(plus, ratioOf(0, 1))
  return [[offset, roundHalfDown(over(minus(excess, carried), liftOf(offset, ratio)))]]
}

function weightsByOffset(
  band: RaritySolveBand,
  rows: OreRows,
  solved: readonly [number, number][],
): number[] {
  const weights = rows.rarity.tiers.map(() => 0)
  for (const [offset, weight] of solved) weights[offset] = weight
  const drawn = weights.reduce((sum, weight) => sum + weight, 0)
  weights[0] = BASIS_POINTS - band.signatureBp - drawn
  return weights
}

/** `m_k^-alpha`. */
function shapeOf(offset: number, ratio: WholeFraction, alpha: number): WholeFraction {
  return over(ONE, powerOf(ratio, offset * alpha))
}

/** `m_k - 1`. */
function liftOf(offset: number, ratio: WholeFraction): WholeFraction {
  return minus(powerOf(ratio, offset), ONE)
}

/** `valueRatio` as a fraction in lowest terms ("1.5" is 3/2): its decimal shifted until whole. */
function valueRatioFraction(): WholeFraction {
  const ratio = ECONOMY.ore.valueRatio
  let denominator = 1
  while (!isWhole(mul(ratio, fromSafeInteger(denominator)))) denominator *= DECIMAL_BASE
  return ratioOf(toSafeInteger(mul(ratio, fromSafeInteger(denominator))), denominator)
}

function isWhole(amount: Money): boolean {
  return cmp(floor(amount), amount) === 0
}

function powerOf(base: WholeFraction, exponent: number): WholeFraction {
  let result = ONE
  for (let step = 0; step < exponent; step++) result = times(result, base)
  return result
}

function plus(a: WholeFraction, b: WholeFraction): WholeFraction {
  return ratioOf(
    a.numerator * b.denominator + b.numerator * a.denominator,
    a.denominator * b.denominator,
  )
}

function minus(a: WholeFraction, b: WholeFraction): WholeFraction {
  return plus(a, { numerator: -b.numerator, denominator: b.denominator })
}

function times(a: WholeFraction, b: WholeFraction): WholeFraction {
  return ratioOf(a.numerator * b.numerator, a.denominator * b.denominator)
}

function over(a: WholeFraction, b: WholeFraction): WholeFraction {
  return ratioOf(a.numerator * b.denominator, a.denominator * b.numerator)
}

/** In lowest terms with a positive denominator; refuses a term past the safe integers. */
function ratioOf(numerator: number, denominator: number): WholeFraction {
  if (!Number.isSafeInteger(numerator) || !Number.isSafeInteger(denominator) || denominator === 0)
    throw new RangeError(`the rarity solve left exact integers: ${numerator}/${denominator}`)
  const sign = Math.sign(numerator) * Math.sign(denominator)
  const terms = lowestTerms(Math.abs(numerator), Math.abs(denominator))
  return { numerator: sign * terms.numerator, denominator: terms.denominator }
}

/** The nearest whole number, a half rounded down. */
function roundHalfDown({ numerator, denominator }: WholeFraction): number {
  const twice = 2 * numerator - denominator
  const whole = Math.floor(twice / (2 * denominator))
  return twice % (2 * denominator) === 0 ? whole : whole + 1
}
