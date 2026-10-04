import { describe, expect, it } from 'vitest'
import { formatMoney } from './formatMoney'

describe('format money', () => {
  it('groups thousands for ordinary amounts', () => {
    expect(formatMoney(1234567)).toBe('1,234,567')
  })

  it('rounds to whole units', () => {
    expect(formatMoney(12.6)).toBe('13')
  })

  it('switches to scientific notation for huge amounts', () => {
    expect(formatMoney(1e100)).toBe('1.00e100')
  })

  it('says unbounded rather than Infinity', () => {
    expect(formatMoney(Infinity)).toBe('unbounded')
  })
})
