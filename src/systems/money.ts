/**
 * Money and BigStat: every economy value that grows without bound (money, costs, prices, drill
 * power, hardness, enemy stats). Decision #5: decimal.js digit-array arithmetic at precision 40
 * with one fixed rounding mode, so add/sub/mul/div/powInt give identical results on every OS and
 * Electron version. This is the only module in `src/` that constructs a Decimal (lint enforces it).
 *
 * The public surface is deliberately small so the backend can be swapped with a
 * `numberFormatVersion` bump. Values are immutable; callers never see a Decimal.
 *
 * Wire and save format (#5 rule 4): `toExponential()` with minimal digits (`"1.5e+0"`), negative
 * zero written as `"0e+0"`; parsing goes through a strict pattern first. NaN and Infinity are
 * refused at both ends.
 */
import Decimal from 'decimal.js'

/** Bump when the canonical string format or the backend changes; saves and logs record it. */
export const NUMBER_FORMAT_VERSION = 1

/** Every Money value and result keeps at most this many significant digits (#5). */
const MONEY_SIGNIFICANT_DIGITS = 40
const MoneyDecimal = Decimal.clone({
  precision: MONEY_SIGNIFICANT_DIGITS,
  rounding: Decimal.ROUND_HALF_EVEN,
})

declare const moneyBrand: unique symbol

/** An exact decimal amount. Opaque: only this module's functions read or make one. */
export interface Money {
  readonly [moneyBrand]: 'Money'
}

/** Unbounded vehicle and enemy stats share Money's representation and rules (#5). */
export type BigStat = Money

/** Plain decimal text: optional minus, no leading zeros, optional fraction, optional exponent. */
const DECIMAL_TEXT = /^-?(0|[1-9][0-9]*)(\.[0-9]+)?(e[+-]?[0-9]+)?$/

export const ZERO_MONEY: Money = wrap(new MoneyDecimal(0))

export function fromCanonical(text: string): Money {
  if (typeof text !== 'string' || !DECIMAL_TEXT.test(text)) {
    throw new RangeError(`money must be a decimal string such as "1.5e+3", got ${String(text)}`)
  }
  return wrap(new MoneyDecimal(text))
}

export function toCanonical(amount: Money): string {
  const value = unwrap(amount)
  return value.isZero() ? '0e+0' : value.toExponential()
}

export function add(a: Money, b: Money): Money {
  return wrap(unwrap(a).plus(unwrap(b)))
}

export function sub(a: Money, b: Money): Money {
  return wrap(unwrap(a).minus(unwrap(b)))
}

export function mul(a: Money, b: Money): Money {
  return wrap(unwrap(a).times(unwrap(b)))
}

export function div(a: Money, b: Money): Money {
  return wrap(unwrap(a).dividedBy(unwrap(b)))
}

/** -1, 0 or 1, as `a` is below, equal to or above `b`. */
export function cmp(a: Money, b: Money): -1 | 0 | 1 {
  return unwrap(a).comparedTo(unwrap(b)) as -1 | 0 | 1
}

/**
 * `base^exponent` for a whole exponent (cost curves are `base * ratio^level`, #5 rule 1).
 * decimal.js uses exponentiation by squaring for these, never the OS `Math.pow`.
 */
export function powInt(base: Money, exponent: number): Money {
  if (!Number.isSafeInteger(exponent)) {
    throw new RangeError(`powInt needs a safe integer exponent, got ${exponent}`)
  }
  return wrap(unwrap(base).pow(exponent))
}

/** The growth ratios `nthRoot` is sized for: its fixed iteration count settles inside them. */
const ROOT_BASE_MIN = new MoneyDecimal(1).dividedBy(2)
const ROOT_BASE_MAX = new MoneyDecimal(2)
const ROOT_ITERATIONS = 64

/**
 * `base^(1/n)` for a whole `n >= 1` and a growth ratio from 1/2 to 2 (#180 TD: the pip roots
 * `ratio^(1/10)` and `g^(1/18)`). Newton's method with a fixed iteration count, using only add,
 * mul, div and `powInt`, so every OS computes the same digits: decimal.js `pow` with a fraction
 * seeds itself from the OS `Math.pow`. The start `1 + (base - 1) / n` is never below the root
 * (Bernoulli), so the steps fall monotonically onto it.
 */
export function nthRoot(base: Money, n: number): Money {
  const a = unwrap(base)
  assertRootArguments(a, n)
  const degree = new MoneyDecimal(n)
  let x = a.minus(1).dividedBy(degree).plus(1)
  for (let step = 0; step < ROOT_ITERATIONS; step++) {
    x = x
      .times(n - 1)
      .plus(a.dividedBy(x.pow(n - 1)))
      .dividedBy(degree)
  }
  return wrap(x)
}

function assertRootArguments(base: Decimal, n: number): void {
  if (!Number.isSafeInteger(n) || n < 1) {
    throw new RangeError(`nthRoot needs a whole degree >= 1, got ${n}`)
  }
  if (base.lessThan(ROOT_BASE_MIN) || base.greaterThan(ROOT_BASE_MAX)) {
    throw new RangeError(`nthRoot takes a growth ratio from 1/2 to 2, got ${base.toString()}`)
  }
}

export function floor(amount: Money): Money {
  return wrap(unwrap(amount).floor())
}

export function ceil(amount: Money): Money {
  return wrap(unwrap(amount).ceil())
}

/** The nearest whole amount, ties to even (the module's one rounding mode). */
export function roundToWhole(amount: Money): Money {
  return wrap(unwrap(amount).round())
}

/**
 * The money quantum (#20, Systems & Economy addition 2): every charge (recharge, repair, rescue
 * fee, travel fee) is rounded up to it and every per-unit sale price down, so totals are exact
 * sums and the money shown always adds up. Past about 1e37 the 0.001 step is finer than the 40th
 * significant digit, so the step becomes that digit (#316 TD scope f, ticket 340): totals are
 * exact to 40 significant digits and deterministic, and the rounding still goes up for a charge
 * and down for income. `economy-constants.json` records the same rule.
 */
const MONEY_QUANTUM_DECIMALS = 3

/** Rounds a charge up to the next 0.001, or the next 40th significant digit when coarser. */
export function ceilMilli(amount: Money): Money {
  return wrap(roundToMoneyStep(unwrap(amount), Decimal.ROUND_CEIL))
}

/** Rounds income (the per-unit ore sale price) down to 0.001, or the 40th significant digit. */
export function floorMilli(amount: Money): Money {
  return wrap(roundToMoneyStep(unwrap(amount), Decimal.ROUND_FLOOR))
}

/**
 * `toDecimalPlaces(3)` alone keeps 41 digits and more past 1e37, which the next operation rounds
 * half-to-even at the 40th: a charge could end up rounded down. Rounding at the coarser of the
 * two steps leaves an amount no later operation re-rounds.
 */
function roundToMoneyStep(value: Decimal, rounding: Decimal.Rounding): Decimal {
  if (isMilliFinerThanPrecision(value)) {
    return value.toSignificantDigits(MONEY_SIGNIFICANT_DIGITS, rounding)
  }
  return value.toDecimalPlaces(MONEY_QUANTUM_DECIMALS, rounding)
}

/** The digit of 0.001 sits past the 40th significant digit of `value`. */
function isMilliFinerThanPrecision(value: Decimal): boolean {
  return !value.isZero() && value.e + 1 + MONEY_QUANTUM_DECIMALS > MONEY_SIGNIFICANT_DIGITS
}

/**
 * Fixed-point text with `places` decimals, ties away from zero as `Number#toFixed` rounds, for
 * report lines (a payoff multiple, a percent). It reads the decimal itself, so 1e400 prints its
 * digits where a double would print Infinity (ticket 340: no `Number(toCanonical(...))`).
 */
export function toFixedText(amount: Money, places: number): string {
  assertSafeInteger(places)
  return unwrap(amount).toFixed(places, Decimal.ROUND_HALF_UP)
}

/** A bounded count (level, units, tiles) as money, so it can scale a price. */
export function fromSafeInteger(count: number): Money {
  assertSafeInteger(count)
  return wrap(new MoneyDecimal(count))
}

/**
 * A bounded float (a rate or a share in the pacing bot's plan) as money, so the plan multiplies it
 * by a price in Money and never turns the price into a double, which is Infinity past 1.8e308
 * (#196). An authority amount comes from canonical text or a safe integer, never from here.
 */
export function fromFiniteNumber(value: number): Money {
  return wrap(new MoneyDecimal(value))
}

/** A whole amount that is a bounded count again (for example `ceil(0.4 * coreTileCount)`). */
export function toSafeInteger(amount: Money): number {
  const value = unwrap(amount)
  const count = value.isInteger() ? value.toNumber() : Number.NaN
  assertSafeInteger(count)
  return count
}

/** Whether `text` parses as money >= 0: the check for a grant or a scenario's starting money. */
export function isNonNegativeMoneyText(text: unknown): boolean {
  if (typeof text !== 'string' || !DECIMAL_TEXT.test(text)) return false
  const value = new MoneyDecimal(text)
  return value.isFinite() && (value.isZero() || value.isPositive())
}

export function isMoney(value: unknown): value is Money {
  return value instanceof MoneyDecimal
}

function assertSafeInteger(count: number): void {
  if (!Number.isSafeInteger(count)) throw new RangeError(`expected a safe integer, got ${count}`)
}

/** Every value leaving this module is finite: Infinity and NaN never become money. */
function wrap(value: Decimal): Money {
  if (!value.isFinite()) throw new RangeError('money left the representable range')
  return value as unknown as Money
}

function unwrap(amount: Money): Decimal {
  return amount as unknown as Decimal
}
