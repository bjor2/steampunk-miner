import { describe, expect, it } from 'vitest'
import { createSeededRandom } from './seededRandom'

function drawFloats(seed: number, count: number): number[] {
  const random = createSeededRandom(seed)
  return Array.from({ length: count }, () => random.nextFloat())
}

describe('seeded random', () => {
  it('gives the same sequence for the same seed', () => {
    expect(drawFloats(83921, 20)).toEqual(drawFloats(83921, 20))
  })

  it('gives a different sequence for a different seed', () => {
    expect(drawFloats(83921, 20)).not.toEqual(drawFloats(83922, 20))
  })

  it('keeps every float in [0, 1)', () => {
    for (const value of drawFloats(1, 1000)) {
      expect(value).toBeGreaterThanOrEqual(0)
      expect(value).toBeLessThan(1)
    }
  })

  it('keeps every integer below the exclusive maximum', () => {
    const random = createSeededRandom(7)
    for (let i = 0; i < 1000; i++) {
      const value = random.nextInt(6)
      expect(Number.isInteger(value)).toBe(true)
      expect(value).toBeGreaterThanOrEqual(0)
      expect(value).toBeLessThan(6)
    }
  })

  it('treats a negative seed as a seed, not an error', () => {
    expect(drawFloats(-5, 5)).toEqual(drawFloats(-5, 5))
  })

  it('repeats a pinned sequence, so a change to the generator is a visible decision', () => {
    // Pinned from the first implementation; a deliberate generator change updates these and
    // is named in the commit, because every saved world seed changes with it.
    expect(drawFloats(1, 3)).toEqual([0.6270739405881613, 0.002735721180215478, 0.5274470399599522])
  })
})
