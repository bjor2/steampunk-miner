import { describe, expect, it } from 'vitest'
import { readIndexText, toIndexText } from './planetAddress'

describe('star map address text', () => {
  it('crosses JSON as a canonical decimal string and reads back exactly', () => {
    const index = 10n ** 30n + 7n
    expect(toIndexText(index)).toBe('1000000000000000000000000000007')
    expect(readIndexText(toIndexText(index))).toBe(index)
  })

  it('reads nothing but a canonical index from 1', () => {
    expect(['0', '01', '-3', '1.5', '1e6', ' 2', '', 2].map(readIndexText)).toEqual(
      Array(8).fill(null),
    )
  })
})
