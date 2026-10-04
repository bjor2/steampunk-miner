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

const MoneyDecimal = Decimal.clone({ precision: 40, rounding: Decimal.ROUND_HALF_EVEN })

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

export function floor(amount: Money): Money {
  return wrap(unwrap(amount).floor())
}

export function ceil(amount: Money): Money {
  return wrap(unwrap(amount).ceil())
}

/**
 * The money quantum (#20, Systems & Economy addition 2): every charge (recharge, repair, rescue
 * fee, travel fee) is rounded up to it and every per-unit sale price down, so totals are exact
 * sums and the money shown always adds up. `economy-constants.json` records the same rule.
 */
const MONEY_QUANTUM_DECIMALS = 3

/** Rounds a charge up to the next multiple of 0.001. */
export function ceilMilli(amount: Money): Money {
  return wrap(unwrap(amount).toDecimalPlaces(MONEY_QUANTUM_DECIMALS, Decimal.ROUND_CEIL))
}

/** Rounds income (the per-unit ore sale price) down to a multiple of 0.001. */
export function floorMilli(amount: Money): Money {
  return wrap(unwrap(amount).toDecimalPlaces(MONEY_QUANTUM_DECIMALS, Decimal.ROUND_FLOOR))
}

/** A bounded count (level, units, tiles) as money, so it can scale a price. */
export function fromSafeInteger(count: number): Money {
  assertSafeInteger(count)
  return wrap(new MoneyDecimal(count))
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
