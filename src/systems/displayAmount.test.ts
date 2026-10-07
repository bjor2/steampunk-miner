import { describe, expect, it } from 'vitest'
import { exactAmount, formatAmount, formatPercent } from './displayAmount'
import { fromCanonical, toCanonical } from './money'

const show = (text: string) => formatAmount(fromCanonical(text))

// Ticket #32 acceptance and the Systems & Economy display rules in its final comment.
const MONEY_GOLDEN: ReadonlyArray<readonly [string, string]> = [
  ['0', '0'],
  ['0.045', '0.045'],
  ['6.75', '6.75'],
  ['11.25', '11.25'],
  ['60.8', '60.8'],
  ['75.937', '75.937'],
  ['999', '999'],
  ['999.999', '999.999'],
  ['1000', '1,000'],
  ['1234.567', '1,234'],
  ['999999', '999,999'],
  ['999999.9', '999,999'],
  ['1000000', '1.00e6'],
  ['2159000000000', '2.15e12'],
  ['1e15', '1.00e15'],
  ['1e100', '1.00e100'],
  ['1e400', '1.00e400'],
  ['9.999e999', '9.99e999'],
]

describe('display amount', () => {
  it.each(MONEY_GOLDEN)('shows %s as %s', (amount, text) => {
    expect(show(amount)).toBe(text)
  })

  it('prints a four-digit exponent in nine characters, the one money text past eight', () => {
    expect(show('1e1000')).toBe('1.00e1000')
  })

  it('keeps every money text from zero to 1e999 within eight characters', () => {
    const widest = Array.from({ length: 997 }, (_, step) => `9.9999999e${step + 3}`)
    const amounts = [...MONEY_GOLDEN.map(([amount]) => amount), ...widest]
    const tooLong = amounts.map(show).filter((text) => text.length > 8)
    expect(tooLong).toEqual([])
  })

  it('never prints NaN or Infinity, even far past the range of a double', () => {
    const texts = ['1e308', '1.8e309', '7.7e5000', '1e9000000'].map(show)
    expect(texts).toEqual(['1.00e308', '1.80e309', '7.70e5000', '1.00e9000000'])
  })

  it('truncates the mantissa instead of rounding it up into the next exponent', () => {
    expect(show('9.999e20')).toBe('9.99e20')
    expect(show('999999.999')).toBe('999,999')
  })

  it('gives the same text for the same amount however it was written', () => {
    const spellings = ['2159000000000', '2.159e12', '2.1590e+12', '21.59e11']
    expect(new Set(spellings.map(show))).toEqual(new Set(['2.15e12']))
  })

  it('refuses an amount below 1,000 with more than three decimals, which the authority never makes', () => {
    expect(() => show('0.0451')).toThrow(RangeError)
  })

  it('shows integer counts with the same rules as money', () => {
    expect([0, 999, 1000, 999_999, 1_000_000, 123_456_789].map(formatAmount)).toEqual([
      '0',
      '999',
      '1,000',
      '999,999',
      '1.00e6',
      '1.23e8',
    ])
  })

  it('refuses a count that is not a safe integer', () => {
    expect(() => formatAmount(1.5)).toThrow(RangeError)
  })

  it('puts a minus sign in front of a negative amount', () => {
    expect(show('-1234.5')).toBe('-1,234')
  })

  it('exposes the exact canonical money string for tooltips and logs', () => {
    expect(exactAmount(fromCanonical('1234.567'))).toBe(toCanonical(fromCanonical('1234.567')))
    expect(exactAmount(1000)).toBe('1e+3')
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
  ['1e5', '1.00e7%'],
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
