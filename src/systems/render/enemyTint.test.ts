import { describe, expect, it } from 'vitest'
import { enemyGlowOf, enemySizeScaleOf, TINT_CAP, tintIndex } from './enemyTint'

const TIERS = [1, 2, 5, 6, 7, 11, 12, 13, 40, 100, 1000, 1_000_000]

const isNonDecreasing = (values: number[]) =>
  values.every((value, at) => at === 0 || value >= values[at - 1])

describe('enemy tint by tier', () => {
  it('never steps back to an earlier colour as the tier rises', () => {
    expect(isNonDecreasing(TIERS.map(tintIndex))).toBe(true)
  })

  it('stops at the last colour of the ramp however high the tier', () => {
    expect(tintIndex(1_000_000)).toBe(TINT_CAP)
    TIERS.forEach((tier) => expect(tintIndex(tier)).toBeLessThanOrEqual(TINT_CAP))
  })

  it('gives planet 1 and planet 2 enemies different colours', () => {
    // enemyTier steps 6 per planet (#20): planet 1 is tiers 1 to 5, planet 2 tiers 7 to 11.
    const planetOne = [1, 2, 3, 4, 5].map(tintIndex)
    const planetTwo = [7, 8, 9, 10, 11].map(tintIndex)
    expect(new Set(planetOne).size).toBe(1)
    expect(new Set(planetTwo).size).toBe(1)
    expect(planetTwo[0]).toBeGreaterThan(planetOne[0])
  })

  it('runs the size from 1.0x at tier 1 toward 1.25x, never past it', () => {
    expect(enemySizeScaleOf(1)).toBe(1)
    expect(isNonDecreasing(TIERS.map(enemySizeScaleOf))).toBe(true)
    TIERS.forEach((tier) => expect(enemySizeScaleOf(tier)).toBeLessThan(1.25))
    expect(enemySizeScaleOf(1_000_000)).toBeCloseTo(1.25, 4)
  })

  it('saturates the glow: rising with tier, never past its cap', () => {
    const glows = TIERS.map(enemyGlowOf)
    expect(isNonDecreasing(glows)).toBe(true)
    expect(glows[0]).toBe(0)
    glows.forEach((glow) => expect(glow).toBeLessThan(1))
    expect(enemyGlowOf(1000) - enemyGlowOf(100)).toBeLessThan(enemyGlowOf(11) - enemyGlowOf(1))
  })
})
