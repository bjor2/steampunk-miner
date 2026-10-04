import { describe, expect, it } from 'vitest'
import {
  add,
  cmp,
  div,
  floor,
  fromCanonical,
  isMoney,
  isNonNegativeMoneyText,
  mul,
  powInt,
  sub,
  toCanonical,
  ZERO_MONEY,
  type Money,
} from './money'

const m = fromCanonical

/** 1,000 values across the range #5 names: zero, tiny, 1e30, past 1e308, past 1e5000. */
function roundTripSamples(): string[] {
  const fixed = ['0', '1e-6', '1e30', '1e308', '1e400', '1e5000', '1.5', '1.50', '-7.25e-3']
  const generated = Array.from({ length: 1000 - fixed.length }, (_, index) => {
    const mantissa = (index * 7919) % 100000
    const exponent = ((index * 104729) % 12000) - 6000
    return `${mantissa}.${index % 97}e${exponent}`
  })
  return [...fixed, ...generated]
}

describe('money: canonical strings', () => {
  it('round-trips 1,000 values from 0 to 1e5000 through canonical strings', () => {
    for (const text of roundTripSamples()) {
      const value = m(text)
      expect(toCanonical(m(toCanonical(value)))).toBe(toCanonical(value))
      expect(m(toCanonical(value))).toEqual(value)
    }
  })

  it('writes minimal digits, so numerically equal inputs give one string', () => {
    expect(toCanonical(m('1.5'))).toBe('1.5e+0')
    expect(toCanonical(m('1.50'))).toBe('1.5e+0')
    expect(toCanonical(m('15e-1'))).toBe('1.5e+0')
  })

  it('writes negative zero as plain zero', () => {
    expect(toCanonical(m('-0'))).toBe('0e+0')
    expect(toCanonical(sub(ZERO_MONEY, ZERO_MONEY))).toBe('0e+0')
  })

  it.each([
    'NaN',
    'Infinity',
    '-Infinity',
    '',
    ' 1',
    '1 ',
    '+1',
    '01',
    '1.',
    '.5',
    '0x10',
    '1e',
    '1,000',
  ])('refuses the malformed string %j', (text) => {
    expect(() => m(text)).toThrow(/money/)
  })

  it('refuses an exponent beyond the range instead of turning it into Infinity', () => {
    expect(() => m('1e99999999999999999')).toThrow(/money/)
  })

  it('refuses a value that is not a string', () => {
    expect(() => m(1 as unknown as string)).toThrow(/money/)
  })
})

describe('money: arithmetic', () => {
  it('keeps 1e30 + 1 - 1e30 exact', () => {
    expect(toCanonical(sub(add(m('1e30'), m('1')), m('1e30')))).toBe('1e+0')
  })

  it('multiplies and divides decimal ratios exactly to 40 digits', () => {
    expect(toCanonical(mul(m('1.15'), m('1.15')))).toBe('1.3225e+0')
    expect(toCanonical(div(m('1'), m('3')))).toBe('3.333333333333333333333333333333333333333e-1')
  })

  it('raises to an integer power as a cost curve base * ratio^n needs', () => {
    expect(toCanonical(powInt(m('1.15'), 3))).toBe('1.520875e+0')
    expect(toCanonical(powInt(m('2'), 0))).toBe('1e+0')
    expect(toCanonical(powInt(m('2'), -2))).toBe('2.5e-1')
  })

  it('refuses a power that is not a safe integer', () => {
    expect(() => powInt(m('2'), 0.5)).toThrow(/powInt/)
  })

  it('floors toward minus infinity', () => {
    expect(toCanonical(floor(m('2.75')))).toBe('2e+0')
    expect(toCanonical(floor(m('-2.25')))).toBe('-3e+0')
  })

  it('compares by value, not by text', () => {
    expect(cmp(m('9'), m('10'))).toBe(-1)
    expect(cmp(m('1.50'), m('1.5'))).toBe(0)
    expect(cmp(m('1e400'), m('1e308'))).toBe(1)
  })

  it('refuses division by zero instead of producing Infinity', () => {
    expect(() => div(m('1'), ZERO_MONEY)).toThrow(/money/)
  })

  it('never changes an operand', () => {
    const a = m('5')
    add(a, m('1'))
    expect(toCanonical(a)).toBe('5e+0')
  })
})

describe('money: tests compare values', () => {
  it('treats equal amounts as equal whatever text they came from', () => {
    expect(m('1.50')).toEqual(m('1.5'))
    expect({ wallet: m('100') }).toEqual({ wallet: m('1e2') })
  })

  it('tells which text is money a player may be granted', () => {
    expect(isNonNegativeMoneyText('1e5000')).toBe(true)
    expect(isNonNegativeMoneyText('0')).toBe(true)
    expect(isNonNegativeMoneyText('-0')).toBe(true)
    expect(isNonNegativeMoneyText('-0.5')).toBe(false)
    expect(isNonNegativeMoneyText('1e99999999999999999')).toBe(false)
    expect(isNonNegativeMoneyText(5)).toBe(false)
  })

  it('tells money apart from other values', () => {
    expect(isMoney(m('1'))).toBe(true)
    expect(isMoney(1)).toBe(false)
    expect(isMoney('1e+0')).toBe(false)
  })

  it('does not accept a raw number where money is expected', () => {
    // @ts-expect-error a number is not Money; it must come through fromCanonical
    const wallet: Money = 5
    expect(isMoney(wallet)).toBe(false)
  })
})
