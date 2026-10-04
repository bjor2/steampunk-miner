import { describe, expect, it } from 'vitest'
import { BASE_BLOCK_HARDNESS } from '../constants/balance'
import { blockHardness } from './blockHardness'

describe('block hardness', () => {
  it('is the base hardness at the surface of the first planet', () => {
    expect(blockHardness(0, 0)).toBe(BASE_BLOCK_HARDNESS)
  })

  it('grows with depth on the same planet', () => {
    expect(blockHardness(3, 0.9)).toBeGreaterThan(blockHardness(3, 0.1))
  })

  it('grows with planet tier at the same depth', () => {
    expect(blockHardness(11, 0.5)).toBeGreaterThan(blockHardness(10, 0.5))
  })

  it('is the same for the same inputs', () => {
    expect(blockHardness(300, 0.82)).toBe(blockHardness(300, 0.82))
  })

  it('stays finite at the late-game tiers the debug API reaches for', () => {
    expect(Number.isFinite(blockHardness(300, 1))).toBe(true)
    expect(Number.isFinite(blockHardness(1000, 1))).toBe(true)
  })

  it('refuses a depth outside the planet', () => {
    expect(() => blockHardness(1, -0.1)).toThrow(RangeError)
    expect(() => blockHardness(1, 1.1)).toThrow(RangeError)
  })

  it('refuses a tier that is not a whole number >= 0', () => {
    expect(() => blockHardness(-1, 0.5)).toThrow(RangeError)
    expect(() => blockHardness(2.5, 0.5)).toThrow(RangeError)
  })
})
