/**
 * The one compact number formatter (#32, ticket 681): every money value, price, income, stat and
 * count shown to the player goes through `formatAmount` or `formatPrice`; tooltips and logs take
 * `exactAmount`. Display is non-authoritative (#5 rule 6), but it still never converts the value
 * through a double: it reads the canonical string, so 1e400 and beyond print the same way as 1e6.
 *
 * Rules (the VS format, GD ruling (a) of 21 Oct 18:33 on spec #678; `numbers` in designTokens.json):
 *   below 10,000          whole digits in full, decimals up to 3 significant   0.045, 60.8, 9,999
 *   10,000 to below 1e36  3 significant figures and a suffix k through Dc      10.0k, 1.23M, 999Dc
 *   from 1e36             e-notation, as many figures as 6 characters hold     1.2e36, 1e300
 * At most 6 characters (the sign of a negative amount aside) up to 1e300; never NaN, Infinity or MAX.
 * Balances, income and counts round toward zero and prices round away from it, so a shown balance
 * at least the shown price means the real balance covers the real price.
 *
 * `formatPercent` shows a share of a whole (Vertical Scaler on #164, K7 #199):
 *   below 1e-6 of the whole      3 significant digits, lowercase e        1.00e-7%
 *   below 0.01%                  a floor, not a number                     <0.01%
 *   0.01% to 99.9%               3 significant digits, truncated           0.41%, 22.8%
 *   from 100%                    as `formatAmount` prints the percent      100%, 1,234%, 10.0M%
 */
import { fromCanonical, fromSafeInteger, isMoneyText, mul, toCanonical, type Money } from './money'
import { DESIGN_TOKENS } from './views/designSystem'

const NUMBERS = DESIGN_TOKENS.numbers
const SIGNIFICANT_FIGURES = NUMBERS.significantFigures
const MAX_CHARS = NUMBERS.maxChars
const SUFFIXES: readonly string[] = NUMBERS.suffixes
/** Each suffix stands for the next power of a thousand: k is 1e3, Dc is 1e33. */
const SUFFIX_STEP_EXPONENT = 3
/** 10,000 is the first amount shown with a suffix (`numbers.wholeBelow`). */
const SUFFIXED_FROM_EXPONENT = NUMBERS.wholeBelow.toString().length - 1
/** Past Dc the amount is printed in e-notation: 1e36. */
const SCIENTIFIC_FROM_EXPONENT = SUFFIX_STEP_EXPONENT * (SUFFIXES.length + 1)
/** The authority's quantum is 0.001 (#20, #23), so no amount shows more decimals. */
const MAX_SHOWN_DECIMALS = 3
/** A share below 1e-6 of the whole is printed in exponent notation (#164 VS amendment). */
const PERCENT_SCIENTIFIC_BELOW_RATIO_EXPONENT = -6
/** The smallest percent printed in digits is 0.01%; anything under it reads `<0.01%`. */
const SMALLEST_SHOWN_PERCENT_EXPONENT = -2
const PERCENT_SIGNIFICANT_DIGITS = 3
const HUNDRED = fromSafeInteger(100)

/** A canonical amount split into sign, significant digits and the power of ten of the first one. */
interface DecimalParts {
  readonly sign: '' | '-'
  readonly digits: string
  readonly exponent: number
}

/** Which way the digits the text drops are rounded: toward zero, or away from it. */
type RoundingWay = 'down' | 'up'

/** Short screen text for a balance, an income or a safe-integer count, rounded toward zero. */
export function formatAmount(amount: Money | number): string {
  return formatParts(splitCanonical(exactAmount(amount)), 'down')
}

/** Short screen text for a price or a charge, rounded up, so it never reads as less than it is. */
export function formatPrice(amount: Money | number): string {
  return formatParts(splitCanonical(exactAmount(amount)), 'up')
}

/** The exact canonical `Money` string, for tooltips, detail views and logs. */
export function exactAmount(amount: Money | number): string {
  return toCanonical(typeof amount === 'number' ? fromSafeInteger(amount) : amount)
}

/**
 * Whether the short text drops digits of the amount (a cut mantissa or fraction), so a tap on the
 * readout has an exact value to show (ticket 476); grouping commas alone hide nothing.
 */
export function isAmountShortened(amount: Money | number): boolean {
  const parts = splitCanonical(exactAmount(amount))
  return parts.digits.length > shownDigitCountOf(parts)
}

/** `isAmountShortened` of a readout's exact text; a text that is no decimal amount hides nothing. */
export function isExactTextShortened(exact: string): boolean {
  return isMoneyText(exact) && isAmountShortened(fromCanonical(exact))
}

/** Short screen text for a share of a whole: 0.0041 is `0.41%`. */
export function formatPercent(ratio: Money): string {
  const ratioParts = splitCanonical(toCanonical(ratio))
  const percentParts = splitCanonical(toCanonical(mul(ratio, HUNDRED)))
  return `${percentParts.sign}${formatPercentMagnitude(ratioParts, percentParts)}%`
}

function formatParts(parts: DecimalParts, way: RoundingWay): string {
  return `${parts.sign}${formatMagnitude(parts, way)}`
}

/** Rounds to the digits the amount's range shows; a carry into a wider range formats again. */
function formatMagnitude(parts: DecimalParts, way: RoundingWay): string {
  const shown = roundToDigits(parts, shownDigitCountOf(parts), way)
  if (shown.exponent !== parts.exponent) return formatMagnitude(shown, way)
  return textOfShownParts(shown)
}

function textOfShownParts(parts: DecimalParts): string {
  if (isZeroParts(parts)) return '0'
  if (parts.exponent >= SCIENTIFIC_FROM_EXPONENT) return scientificText(parts)
  if (parts.exponent >= SUFFIXED_FROM_EXPONENT) return suffixedText(parts)
  return wholeText(parts)
}

function formatPercentMagnitude(ratio: DecimalParts, percent: DecimalParts): string {
  if (isZeroParts(ratio)) return '0'
  if (ratio.exponent < PERCENT_SCIENTIFIC_BELOW_RATIO_EXPONENT)
    return percentScientificText(percent)
  if (percent.exponent < SMALLEST_SHOWN_PERCENT_EXPONENT) return '<0.01'
  if (percent.exponent < PERCENT_SIGNIFICANT_DIGITS - 1) return significantSmallText(percent)
  return formatMagnitude(percent, 'down')
}

/** How many significant digits the text keeps in the amount's range. */
function shownDigitCountOf(parts: DecimalParts): number {
  if (parts.exponent >= SCIENTIFIC_FROM_EXPONENT) return scientificFiguresOf(parts.exponent)
  if (parts.exponent >= SUFFIXED_FROM_EXPONENT) return SIGNIFICANT_FIGURES
  return parts.exponent + 1 + shownDecimalsOf(parts.exponent)
}

/** Below 10,000 the whole digits stay; decimals fill up to 3 significant figures, at most 3. */
function shownDecimalsOf(exponent: number): number {
  return Math.min(MAX_SHOWN_DECIMALS, Math.max(0, SIGNIFICANT_FIGURES - 1 - exponent))
}

/** `d.de36` keeps 2 figures in 6 characters, `de300` keeps 1; a longer exponent still keeps 1. */
function scientificFiguresOf(exponent: number): number {
  const mantissaChars = MAX_CHARS - `e${exponent}`.length
  return Math.max(1, Math.min(SIGNIFICANT_FIGURES, mantissaChars - 1))
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

/**
 * The amount cut to its first `count` significant digits, the rest rounded `way` on the
 * magnitude; a count of 0 or less rounds at a place above the first digit.
 */
function roundToDigits(parts: DecimalParts, count: number, way: RoundingWay): DecimalParts {
  if (count >= parts.digits.length) return parts
  if (way === 'down') return roundedDown(parts, count)
  return roundedUp(parts, count)
}

function roundedDown(parts: DecimalParts, count: number): DecimalParts {
  if (count <= 0) return { sign: '', digits: '0', exponent: 0 }
  return withMinimalDigits({ ...parts, digits: parts.digits.slice(0, count) })
}

/** One unit of the last kept place added to the kept digits; all nines carry into a new digit. */
function roundedUp(parts: DecimalParts, count: number): DecimalParts {
  if (count <= 0) return { ...parts, digits: '1', exponent: parts.exponent - count + 1 }
  const kept = incrementDigits(parts.digits.slice(0, count))
  const exponent = parts.exponent + kept.length - count
  return withMinimalDigits({ ...parts, digits: kept, exponent })
}

function incrementDigits(digits: string): string {
  const lastNotNine = digits.search(/[0-8]9*$/)
  if (lastNotNine < 0) return `1${'0'.repeat(digits.length)}`
  const raised = String.fromCharCode(digits.charCodeAt(lastNotNine) + 1)
  return `${digits.slice(0, lastNotNine)}${raised}${'0'.repeat(digits.length - lastNotNine - 1)}`
}

function withMinimalDigits(parts: DecimalParts): DecimalParts {
  const digits = parts.digits.replace(/0+$/, '')
  return digits === '' ? { sign: '', digits: '0', exponent: 0 } : { ...parts, digits }
}

/** `1.2e36`, `1e300`: as many figures as the 6 characters hold, trailing zeros kept. */
function scientificText(parts: DecimalParts): string {
  const shown = parts.digits.padEnd(scientificFiguresOf(parts.exponent), '0')
  const mantissa = shown.length === 1 ? shown : `${shown[0]}.${shown.slice(1)}`
  return `${mantissa}e${parts.exponent}`
}

/** `10.0k`, `1.23M`, `999Dc`: 3 significant figures, trailing zeros kept so the width holds. */
function suffixedText(parts: DecimalParts): string {
  const group = Math.floor(parts.exponent / SUFFIX_STEP_EXPONENT)
  const wholeLength = parts.exponent - group * SUFFIX_STEP_EXPONENT + 1
  const shown = parts.digits.padEnd(SIGNIFICANT_FIGURES, '0')
  const whole = shown.slice(0, wholeLength)
  const fraction = shown.slice(wholeLength)
  const number = fraction === '' ? whole : `${whole}.${fraction}`
  return `${number}${SUFFIXES[group - 1]}`
}

/** Below 10,000: grouped whole digits and the kept decimals, no trailing zeros. */
function wholeText(parts: DecimalParts): string {
  const fraction = fractionDigits(parts)
  const integer = parts.exponent >= 0 ? groupThousands(integerDigits(parts)) : '0'
  return fraction === '' ? integer : `${integer}.${fraction}`
}

/** A tiny share's percent: 3 significant digits, cut, in the old exponent form `1.00e-7%`. */
function percentScientificText(parts: DecimalParts): string {
  const shown = parts.digits
    .padEnd(PERCENT_SIGNIFICANT_DIGITS, '0')
    .slice(0, PERCENT_SIGNIFICANT_DIGITS)
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

/** A percent below 100 cut to 3 significant digits, with no trailing zeros. */
function significantSmallText(parts: DecimalParts): string {
  const shown = { ...parts, digits: parts.digits.slice(0, PERCENT_SIGNIFICANT_DIGITS) }
  const fraction = fractionDigits(shown).replace(/0+$/, '')
  const integer = shown.exponent >= 0 ? integerDigits(shown) : '0'
  return fraction === '' ? integer : `${integer}.${fraction}`
}

function fractionDigits(parts: DecimalParts): string {
  if (parts.exponent >= 0) return parts.digits.slice(parts.exponent + 1)
  return `${'0'.repeat(-parts.exponent - 1)}${parts.digits}`
}
