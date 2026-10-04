import { describe, expect, it } from 'vitest'
import { formatMoney } from './formatMoney'
import { fromCanonical } from './money'

const show = (text: string) => formatMoney(fromCanonical(text))

describe('format money', () => {
  it('groups thousands for ordinary amounts', () => {
    expect(show('1234567')).toBe('1,234,567')
  })

  it('rounds to whole units', () => {
    expect(show('12.6')).toBe('13')
  })

  it('switches to scientific notation for huge amounts', () => {
    expect(show('1e100')).toBe('1.00e100')
  })

  it('prints amounts past the range of a double', () => {
    expect(show('1.23456e5000')).toBe('1.23e5000')
  })

  it('carries a rounded-up mantissa into the exponent', () => {
    expect(show('9.999e20')).toBe('1.00e21')
  })
})
