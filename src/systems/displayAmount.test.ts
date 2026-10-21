import { describe, expect, it } from 'vitest'
import {
  exactAmount,
  formatAmount,
  formatPercent,
  formatPrice,
  isAmountShortened,
  isExactTextShortened,
} from './displayAmount'
import { cmp, fromCanonical, toCanonical } from './money'
import { DESIGN_TOKENS } from './views/designSystem'

const show = (text: string) => formatAmount(fromCanonical(text))
const price = (text: string) => formatPrice(fromCanonical(text))
const MAX_CHARS = DESIGN_TOKENS.numbers.maxChars

// The VS format (GD ruling (a), 21 Oct 18:33 on spec #678; ticket 681): whole up to 9,999, then 3
// significant figures with k through Dc, then e-notation in at most 6 characters.
const BALANCE_GOLDEN: ReadonlyArray<readonly [string, string]> = [
  ['0', '0'],
  ['1', '1'],
  ['0.045', '0.045'],
  ['6.75', '6.75'],
  ['60.8', '60.8'],
  ['75.937', '75.9'],
  ['999.999', '999'],
  ['1000', '1,000'],
  ['1234.567', '1,234'],
  ['9999', '9,999'],
  ['9999.999', '9,999'],
  ['1e4', '10.0k'],
  ['12345', '12.3k'],
  ['999999', '999k'],
  ['1000000', '1.00M'],
  ['2159000000000', '2.15T'],
  ['1e15', '1.00Qa'],
  ['1e33', '1.00Dc'],
  ['9.999e35', '999Dc'],
  ['1e36', '1.0e36'],
  ['1.29e99', '1.2e99'],
  ['1e100', '1e100'],
  ['1e300', '1e300'],
  ['9.9e300', '9e300'],
]

const PRICE_GOLDEN: ReadonlyArray<readonly [string, string]> = [
  ['0', '0'],
  ['0.0451', '0.046'],
  ['0.0001', '0.001'],
  ['75.931', '76'],
  ['999.001', '1,000'],
  ['9999.001', '10.0k'],
  ['12301', '12.4k'],
  ['999001', '1.00M'],
  ['9.991e35', '1.0e36'],
  ['9.91e99', '1e100'],
  ['1e300', '1e300'],
  ['1.0001e300', '2e300'],
]

/** One amount in each of a run of spellings from 1 to 9.999...e300, as canonical text. */
function amountsUpTo1e300(): string[] {
  const mantissas = ['1', '1.0001', '4.5678', '9.9949', '9.9999999']
  return Array.from({ length: 301 }, (_, exponent) =>
    mantissas.map((mantissa) => `${mantissa}e${exponent}`),
  ).flat()
}

describe('display amount', () => {
  it.each(BALANCE_GOLDEN)('shows the balance %s as %s', (amount, text) => {
    expect(show(amount)).toBe(text)
  })

  it.each(PRICE_GOLDEN)('shows the price %s as %s, rounded up', (amount, text) => {
    expect(price(amount)).toBe(text)
  })

  it('keeps every balance and price text from 0 to 1e300 within six characters', () => {
    const amounts = ['0', '0.001', '0.045', ...amountsUpTo1e300()]
    const texts = amounts.flatMap((amount) => [show(amount), price(amount)])
    expect(texts.filter((text) => text.length > MAX_CHARS)).toEqual([])
  })

  it('never prints NaN, Infinity or a MAX state, up to the largest Money', () => {
    const amounts = ['1e308', '1.8e309', '7.7e5000', '9.99e9000000000000000']
    const texts = amounts.flatMap((amount) => [show(amount), price(amount)])
    expect(texts.filter((text) => /NaN|Infinity|MAX/i.test(text))).toEqual([])
    expect(show('9.99e9000000000000000')).toBe('9e9000000000000000')
  })

  it('reads a shown balance at or above a shown price only when the real balance covers it', () => {
    const amounts = amountsForRoundTrip()
    const misleading = amounts.flatMap((balance) =>
      amounts
        .filter((cost) => isShownAffordable(balance, cost) && cmp(m(balance), m(cost)) < 0)
        .map((cost) => `${balance} against ${cost}`),
    )
    expect(misleading).toEqual([])
  })

  it('gives the same text for the same amount however it was written', () => {
    const spellings = ['2159000000000', '2.159e12', '2.1590e+12', '21.59e11']
    expect(new Set(spellings.map(show))).toEqual(new Set(['2.15T']))
  })

  it('shows integer counts with the same rules as money', () => {
    expect([0, 999, 1000, 9_999, 10_000, 123_456_789].map(formatAmount)).toEqual([
      '0',
      '999',
      '1,000',
      '9,999',
      '10.0k',
      '123M',
    ])
  })

  it('refuses a count that is not a safe integer', () => {
    expect(() => formatAmount(1.5)).toThrow(RangeError)
  })

  it('puts a minus sign in front of a negative amount, rounding its size the same way', () => {
    expect([show('-1234.5'), show('-12399'), price('-12301')]).toEqual([
      '-1,234',
      '-12.3k',
      '-12.4k',
    ])
  })

  it('exposes the exact canonical money string for tooltips and logs', () => {
    expect(exactAmount(fromCanonical('1234.567'))).toBe(toCanonical(fromCanonical('1234.567')))
    expect(exactAmount(1000)).toBe('1e+3')
  })
})

const m = (text: string) => fromCanonical(text)

/** Balances and prices near every place the text rounds, in each range of the format. */
function amountsForRoundTrip(): string[] {
  const near = ['0', '0.001', '0.0451', '0.046', '75.931', '76', '999.001', '1000', '9999.001']
  const ranges = ['1', '1.001', '1.234', '1.235', '9.999', '9.9991'].flatMap((mantissa) =>
    [4, 5, 9, 33, 35, 36, 99, 100, 300].map((exponent) => `${mantissa}e${exponent}`),
  )
  return [...near, ...ranges]
}

/** What a player reads: the shown balance at least the shown price, compared as amounts. */
function isShownAffordable(balance: string, cost: string): boolean {
  return cmp(shownAmountOf(show(balance)), shownAmountOf(price(cost))) >= 0
}

const SUFFIX_EXPONENTS: Readonly<Record<string, number>> = Object.fromEntries(
  DESIGN_TOKENS.numbers.suffixes.map((suffix, index) => [suffix, 3 * (index + 1)]),
)

/** The amount a short text stands for: `12.3k` is 12,300, `1.0e36` is 1e36. */
function shownAmountOf(text: string): ReturnType<typeof m> {
  const [, number, suffix] = /^(-?[\d.,e]+)([A-Za-z]*)$/.exec(text) ?? []
  const exponent = suffix === '' ? 0 : SUFFIX_EXPONENTS[suffix]
  return m(`${number.replaceAll(',', '')}e${exponent}`.replace(/e(\d+)e0$/, 'e$1'))
}

describe('shortened amount', () => {
  it.each([
    ['1.2e149', true],
    ['1e149', false],
    ['1.2345e149', true],
    ['1.23456e7', true],
    ['1234.567', true],
    ['1000000', false],
    ['1.23e8', false],
    ['999999', true],
    ['999000', false],
    ['75.937', true],
    ['75.9', false],
    ['0', false],
    ['-1.2345e149', true],
  ])('says whether the short text of %s hides digits: %s', (amount, isShortened) => {
    expect(isAmountShortened(fromCanonical(amount))).toBe(isShortened)
  })

  it('reads a readout’s exact text, and finds nothing hidden behind a text that is no amount', () => {
    expect(isExactTextShortened('1.2345e+149')).toBe(true)
    expect(isExactTextShortened('1234')).toBe(false)
    expect(isExactTextShortened('3/9')).toBe(false)
  })

  it('reads a safe-integer count the same way', () => {
    expect(isAmountShortened(12_345_678)).toBe(true)
    expect(isAmountShortened(9_999)).toBe(false)
  })
})

const percentOf = (ratio: string) => formatPercent(fromCanonical(ratio))

// K7 (#199) acceptance 8 and the Vertical Scaler's formatter rule on #164: 3 significant digits,
// truncated, never through a double; tiny shares as <0.01% or, below 1e-6, in exponent notation.
const PERCENT_GOLDEN: ReadonlyArray<readonly [string, string]> = [
  ['0.0041', '0.41%'],
  ['0.0002', '0.02%'],
  ['1e-9', '1.00e-7%'],
  ['1e-40', '1.00e-38%'],
  ['0', '0%'],
  ['0.225', '22.5%'],
  ['0.22857', '22.8%'],
  ['1', '100%'],
  ['12.345', '1,234%'],
  ['0.000123', '0.0123%'],
  ['1e5', '10.0M%'],
]

describe('display percent', () => {
  it.each(PERCENT_GOLDEN)('shows the share %s as %s', (ratio, text) => {
    expect(percentOf(ratio)).toBe(text)
  })

  it('truncates instead of rounding, so a share just under a whole percent never reads 1%', () => {
    expect(percentOf('0.00999999999999999999999')).toBe('0.999%')
    expect(percentOf('0.0099999')).toBe('0.999%')
  })

  it('keeps digits a double would lose, far below the smallest double', () => {
    expect(percentOf('1.23456789012345678901e-400')).toBe('1.23e-398%')
  })

  it('prints a share below a hundredth of a percent, but not below a millionth, as <0.01%', () => {
    expect([percentOf('0.0000999'), percentOf('0.000001')]).toEqual(['<0.01%', '<0.01%'])
    expect(percentOf('0.00000099')).toBe('9.90e-5%')
  })

  it('puts a minus sign in front of a falling share', () => {
    expect(percentOf('-0.225')).toBe('-22.5%')
  })
})
