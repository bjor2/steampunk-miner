/**
 * The one large-number display formatter (#32): every money value, price, stat and count shown to
 * the player goes through `formatAmount`; tooltips and logs take `exactAmount`. Display is
 * non-authoritative (#5 rule 6), but it still never converts the value through a double: it reads
 * the canonical string, so 1e400 and beyond print the same way as 1e6.
 *
 * Rules (Systems & Economy Designer, final comment on #32; it replaces the suffixes of #6 section 7):
 *   below 1,000           exact, up to 3 decimals, no trailing zeros       0.045, 60.8, 999.999
 *   1,000 to 999,999      integer part, thousands separator, truncated     1,234
 *   from 1,000,000        3 significant digits, lowercase e, truncated     1.00e6, 2.15e12
 * Truncation toward zero (never rounding up) keeps 999,999.9 from reading as 1.00e6.
 *
 * `formatPercent` shows a share of a whole under the same rules (Vertical Scaler on #164, K7 #199):
 *   below 1e-6 of the whole      3 significant digits, lowercase e        1.00e-7%
 *   below 0.01%                  a floor, not a number                     <0.01%
 *   0.01% to 99.9%               3 significant digits, truncated           0.41%, 22.8%
 *   from 100%                    as `formatAmount` prints the percent      100%, 1,234%, 1.00e7%
 */
import { fromSafeInteger, mul, toCanonical, type Money } from './money'

/** The single switch from grouped digits to scientific notation: 1,000,000 is 1e6. */
const SCIENTIFIC_FROM_EXPONENT = 6
/** Below 1,000 the fraction is shown in full; the authority's quantum is 0.001 (#20, #23). */
const EXACT_BELOW_EXPONENT = 3
const MAX_SHOWN_DECIMALS = 3
const SIGNIFICANT_DIGITS = 3
/** A share below 1e-6 of the whole is printed in exponent notation (#164 VS amendment). */
const PERCENT_SCIENTIFIC_BELOW_RATIO_EXPONENT = -6
/** The smallest percent printed in digits is 0.01%; anything under it reads `<0.01%`. */
const SMALLEST_SHOWN_PERCENT_EXPONENT = -2
const HUNDRED = fromSafeInteger(100)

/** A canonical amount split into sign, significant digits and the power of ten of the first one. */
interface DecimalParts {
  readonly sign: '' | '-'
  readonly digits: string
  readonly exponent: number
}

/** Short screen text for a money value or a safe-integer count. */
export function formatAmount(amount: Money | number): string {
  const parts = splitCanonical(exactAmount(amount))
  return `${parts.sign}${formatMagnitude(parts)}`
}

/** The exact canonical `Money` string, for tooltips, detail views and logs. */
export function exactAmount(amount: Money | number): string {
  return toCanonical(typeof amount === 'number' ? fromSafeInteger(amount) : amount)
}

/** Short screen text for a share of a whole: 0.0041 is `0.41%`. */
export function formatPercent(ratio: Money): string {
  const ratioParts = splitCanonical(toCanonical(ratio))
  const percentParts = splitCanonical(toCanonical(mul(ratio, HUNDRED)))
  return `${percentParts.sign}${formatPercentMagnitude(ratioParts, percentParts)}%`
}

function formatMagnitude(parts: DecimalParts): string {
  if (parts.exponent >= SCIENTIFIC_FROM_EXPONENT) return scientificText(parts)
  if (parts.exponent >= EXACT_BELOW_EXPONENT) return groupThousands(integerDigits(parts))
  return exactSmallText(parts)
}

function formatPercentMagnitude(ratio: DecimalParts, percent: DecimalParts): string {
  if (isZeroParts(ratio)) return '0'
  if (ratio.exponent < PERCENT_SCIENTIFIC_BELOW_RATIO_EXPONENT) return scientificText(percent)
  if (percent.exponent < SMALLEST_SHOWN_PERCENT_EXPONENT) return '<0.01'
  if (percent.exponent < SIGNIFICANT_DIGITS - 1) return significantSmallText(percent)
  return formatMagnitude(percent)
}

function isZeroParts(parts: DecimalParts): boolean {
  return parts.digits === '0'
}

/** `toCanonical` writes `-?d(.ddd)?e[+-]n` with minimal digits, so the digits never end in 0. */
function splitCanonical(canonical: string): DecimalParts {
  const [mantissa, exponent] = canonical.split('e')
  const sign = mantissa.startsWith('-') ? '-' : ''
  const digits = mantissa.replace('-', '').replace('.', '')
  return { sign, digits, exponent: Number.parseInt(exponent, 10) }
}

function scientificText(parts: DecimalParts): string {
  const shown = parts.digits.padEnd(SIGNIFICANT_DIGITS, '0').slice(0, SIGNIFICANT_DIGITS)
  return `${shown[0]}.${shown.slice(1)}e${parts.exponent}`
}

/** The whole-number digits of an amount of at least 1, its fraction dropped. */
function integerDigits(parts: DecimalParts): string {
  const length = parts.exponent + 1
  return parts.digits.padEnd(length, '0').slice(0, length)
}

function groupThousands(integer: string): string {
  return integer.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}

function exactSmallText(parts: DecimalParts): string {
  const fraction = fractionDigits(parts)
  assertWithinQuantum(fraction)
  const integer = parts.exponent >= 0 ? integerDigits(parts) : '0'
  return fraction === '' ? integer : `${integer}.${fraction}`
}

/** A percent below 100 cut to 3 significant digits, with no trailing zeros. */
function significantSmallText(parts: DecimalParts): string {
  const shown = { ...parts, digits: parts.digits.slice(0, SIGNIFICANT_DIGITS) }
  const fraction = fractionDigits(shown).replace(/0+$/, '')
  const integer = shown.exponent >= 0 ? integerDigits(shown) : '0'
  return fraction === '' ? integer : `${integer}.${fraction}`
}

function fractionDigits(parts: DecimalParts): string {
  if (parts.exponent >= 0) return parts.digits.slice(parts.exponent + 1)
  return `${'0'.repeat(-parts.exponent - 1)}${parts.digits}`
}

/** More decimals than the money quantum means a rule skipped `ceilMilli`/`floorMilli`: a bug. */
function assertWithinQuantum(fraction: string): void {
  if (fraction.length > MAX_SHOWN_DECIMALS) {
    throw new RangeError(`a shown amount below 1,000 has at most 3 decimals, got 0.${fraction}`)
  }
}
