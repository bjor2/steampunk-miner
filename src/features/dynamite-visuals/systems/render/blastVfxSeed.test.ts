import { describe, expect, it } from 'vitest'
import { createSeededRandom } from '../../../../systems/seededRandom'
import { blastVfxSeedOf } from './blastVfxSeed'

// D8 (#868), the TD's seam: the look's randomness is seeded from the world and the blast's
// number alone, so a replay or a reload throws every spark the same way.

describe('blast VFX seed', () => {
  it('gives the same seed for the same planet and blast number, a 32-bit whole number', () => {
    const seed = blastVfxSeedOf(0x1234abcd, 7)
    expect(seed).toBe(blastVfxSeedOf(0x1234abcd, 7))
    expect(Number.isInteger(seed)).toBe(true)
    expect(seed).toBeGreaterThanOrEqual(0)
    expect(seed).toBeLessThan(2 ** 32)
  })

  it('seeds the next blast, another planet and a number past 2^32 differently', () => {
    const seed = blastVfxSeedOf(0x1234abcd, 7)
    expect(blastVfxSeedOf(0x1234abcd, 8)).not.toBe(seed)
    expect(blastVfxSeedOf(0x1234abce, 7)).not.toBe(seed)
    expect(blastVfxSeedOf(0x1234abcd, 7 + 2 ** 32)).not.toBe(seed)
  })

  it('drives a seeded random that repeats its draws', () => {
    const draws = () => {
      const random = createSeededRandom(blastVfxSeedOf(42, 3))
      return Array.from({ length: 5 }, () => random.nextFloat())
    }
    expect(draws()).toEqual(draws())
  })
})
