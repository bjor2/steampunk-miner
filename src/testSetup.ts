/**
 * Vitest setup for every spec. The feature slices are loaded first, as in every composition root
 * (docs/standards/feature-slices.md 3.3). Money values are compared by value (decision #5 rule 7),
 * so `toEqual` never depends on how the backend stores digits.
 */
import { expect } from 'vitest'
import { loadFeatures } from './features'
import { cmp, isMoney } from './systems/money'

loadFeatures()

expect.addEqualityTesters([
  function areMoneyAmountsEqual(a: unknown, b: unknown): boolean | undefined {
    if (!isMoney(a) || !isMoney(b)) return undefined
    return cmp(a, b) === 0
  },
])
