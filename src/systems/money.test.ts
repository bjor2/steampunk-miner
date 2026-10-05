import { describe, expect, it } from 'vitest'
import {
  add,
  ceil,
  ceilMilli,
  cmp,
  div,
  floor,
  floorMilli,
  fromCanonical,
  fromSafeInteger,
  isMoney,
  isNonNegativeMoneyText,
  mul,
  powInt,
  roundToWhole,
  sub,
  toCanonical,
  toSafeInteger,
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

  it('ceils toward plus infinity, as an upgrade price ceil(base * ratio^level) needs', () => {
    expect(toCanonical(ceil(m('29.76')))).toBe('3e+1')
    expect(toCanonical(ceil(m('24')))).toBe('2.4e+1')
  })

  it('rounds to the nearest whole amount, ties to even', () => {
    expect(toCanonical(roundToWhole(m('62.7')))).toBe('6.3e+1')
    expect(toCanonical(roundToWhole(m('62.5')))).toBe('6.2e+1')
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

describe('money: the one rounding rule for charges and income', () => {
  it('rounds every charge up to the next 0.001', () => {
    expect(toCanonical(ceilMilli(m('0.0451')))).toBe(toCanonical(m('0.046')))
    expect(toCanonical(ceilMilli(m('0.045')))).toBe(toCanonical(m('0.045')))
  })

  it('rounds a per-unit ore price down to a multiple of 0.001', () => {
    expect(toCanonical(floorMilli(m('75.9375')))).toBe(toCanonical(m('75.937')))
  })

  it('makes a sale of 7 tier-6 ore units exactly 531.559', () => {
    const unitPrice = floorMilli(m('75.9375'))
    expect(toCanonical(mul(unitPrice, fromSafeInteger(7)))).toBe(toCanonical(m('531.559')))
  })

  it('leaves amounts far above the 0.001 step unchanged', () => {
    expect(ceilMilli(m('1.23e30'))).toEqual(m('1.23e30'))
  })
})

describe('money: whole counts', () => {
  it('turns a safe integer such as a level or a unit count into money', () => {
    expect(toCanonical(fromSafeInteger(156))).toBe('1.56e+2')
  })

  it('refuses a count that is not a safe integer', () => {
    expect(() => fromSafeInteger(1.5)).toThrow(/integer/)
    expect(() => fromSafeInteger(Number.MAX_SAFE_INTEGER + 1)).toThrow(/integer/)
  })

  it('reads a whole amount such as a tile count back as a number', () => {
    expect(toSafeInteger(ceil(m('62.4')))).toBe(63)
  })

  it('refuses to read a fraction or a huge amount as a count', () => {
    expect(() => toSafeInteger(m('62.4'))).toThrow(/integer/)
    expect(() => toSafeInteger(m('1e30'))).toThrow(/integer/)
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
