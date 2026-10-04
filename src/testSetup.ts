/**
 * Vitest setup for every spec. Money values are compared by value (decision #5 rule 7), so
 * `toEqual` never depends on how the backend stores digits.
 */
import { expect } from 'vitest'
import { cmp, isMoney } from './systems/money'

expect.addEqualityTesters([
  function areMoneyAmountsEqual(a: unknown, b: unknown): boolean | undefined {
    if (!isMoney(a) || !isMoney(b)) return undefined
    return cmp(a, b) === 0
  },
])
