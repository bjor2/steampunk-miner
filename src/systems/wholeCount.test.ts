import { describe, expect, it } from 'vitest'
import {
  countAsSafeInteger,
  countHeldToSafe,
  countOfJson,
  countToJson,
  isJsonCount,
  largerCount,
  smallerCount,
} from './wholeCount'

const LARGEST_SAFE = BigInt(Number.MAX_SAFE_INTEGER)

describe('whole counts (ticket 849)', () => {
  it('writes a count as a JSON number up to 2^53 - 1 and as its decimal text past it', () => {
    expect(countToJson(0n)).toBe(0)
    expect(countToJson(LARGEST_SAFE)).toBe(Number.MAX_SAFE_INTEGER)
    expect(countToJson(LARGEST_SAFE + 1n)).toBe('9007199254740992')
    expect(countToJson(10n ** 41393n)).toBe(`1${'0'.repeat(41393)}`)
  })

  it('reads either spelling back to the exact count', () => {
    for (const count of [0n, 7n, LARGEST_SAFE, LARGEST_SAFE + 1n, 3n * 10n ** 60n]) {
      expect(countOfJson(countToJson(count))).toBe(count)
    }
  })

  it('accepts only the one spelling of each count', () => {
    expect([0, 12, Number.MAX_SAFE_INTEGER, '9007199254740992'].every(isJsonCount)).toBe(true)
    const refused = [-1, 1.5, 2 ** 53, '12', '0', '09007199254740993', '-9007199254740993', 12n]
    expect(refused.filter(isJsonCount)).toEqual([])
  })

  it('holds a count to the safe integers for a per-tick budget, and refuses it for a model', () => {
    expect(countHeldToSafe(40n)).toBe(40)
    expect(countHeldToSafe(LARGEST_SAFE * 2n)).toBe(Number.MAX_SAFE_INTEGER)
    expect(countAsSafeInteger(LARGEST_SAFE)).toBe(Number.MAX_SAFE_INTEGER)
    expect(() => countAsSafeInteger(LARGEST_SAFE + 1n)).toThrow(RangeError)
  })

  it('picks the smaller and the larger of two counts', () => {
    expect(smallerCount(3n, LARGEST_SAFE + 1n)).toBe(3n)
    expect(largerCount(3n, LARGEST_SAFE + 1n)).toBe(LARGEST_SAFE + 1n)
  })
})
