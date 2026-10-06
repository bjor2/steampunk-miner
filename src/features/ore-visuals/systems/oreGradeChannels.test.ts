import { describe, expect, it } from 'vitest'
import { oreTier } from '../../../systems/economy/oreEconomy'
import { oreGradeOf } from '../../../systems/render/oreGrade'
import {
  oreGlowOf,
  oreGradeChannelsOf,
  oreHitParticlesOf,
  oreSparklesOf,
  oreStrengthOf,
  visualEchoOf,
} from './oreGradeChannels'

const TIERS = Array.from({ length: 200 }, (_, at) => at + 1)

describe('ore grade channels (#151)', () => {
  it('adds one channel per grade and keeps every channel below it', () => {
    expect(oreGradeChannelsOf(1)).toEqual(['form'])
    expect(oreGradeChannelsOf(3)).toEqual(['form', 'sheen', 'structure'])
    expect(oreGradeChannelsOf(5)).toEqual(['form', 'sheen', 'structure', 'innerLight', 'ownEffect'])
  })

  it('shows no emission or sparkle at G1 and G2, then more of both with each grade', () => {
    expect([1, 11].map((tier) => oreGlowOf(tier))).toEqual([0, 0])
    expect([1, 2].map((grade) => oreSparklesOf(grade))).toEqual([0, 0])
    expect(oreGlowOf(12)).toBeGreaterThan(0)
    expect(oreSparklesOf(3)).toBeGreaterThan(0)
    const glows = TIERS.map((tier) => oreGlowOf(tier))
    glows.slice(1).forEach((glow, at) => expect(glow).toBeGreaterThanOrEqual(glows[at]))
  })

  it('rises in strength from the first tier of a grade to the last, so band 5 reads stronger than band 1', () => {
    expect(oreStrengthOf(12)).toBe(0)
    expect(oreStrengthOf(29)).toBeCloseTo(17 / 18, 6)
    expect(oreStrengthOf(30)).toBe(0)
    for (const grade of [1, 2, 3, 4, 5]) {
      const strengths = TIERS.filter((tier) => oreGradeOf(tier) === grade).map((t) =>
        oreStrengthOf(t),
      )
      strengths.slice(1).forEach((s, at) => expect(s).toBeGreaterThanOrEqual(strengths[at]))
    }
  })

  it('ramps G5 from tier 70 to tier 96 and then stays flat', () => {
    expect(oreStrengthOf(70)).toBe(0)
    expect(oreStrengthOf(96)).toBeLessThan(1)
    expect(oreStrengthOf(97)).toBe(1)
    expect(oreStrengthOf(200)).toBe(1)
    expect(oreGlowOf(200)).toBe(oreGlowOf(97))
  })

  it('throws 4, 8, 12, 20 and 32 particles per hit by grade', () => {
    expect([1, 2, 3, 4, 5].map((grade) => oreHitParticlesOf(grade))).toEqual([4, 8, 12, 20, 32])
  })

  it('starts the visual echo at planet 33 and adds a countable ring every 8 planets', () => {
    const bandOne = (planet: number) => oreTier(planet, 1)
    expect(visualEchoOf(bandOne(32))).toEqual({ echo: 0, rings: 0, effectVariant: null })
    expect(visualEchoOf(bandOne(33))).toEqual({ echo: 1, rings: 1, effectVariant: null })
    expect(visualEchoOf(bandOne(41))).toEqual({ echo: 2, rings: 2, effectVariant: null })
    expect(visualEchoOf(bandOne(49))).toEqual({ echo: 3, rings: 3, effectVariant: null })
  })

  it('keeps the 3 rings from planet 57 and cycles the G5 effect variants every 8 planets', () => {
    const bandOne = (planet: number) => oreTier(planet, 1)
    expect(visualEchoOf(bandOne(57))).toEqual({ echo: 4, rings: 3, effectVariant: 'arc-crown' })
    expect(visualEchoOf(bandOne(65)).effectVariant).toBe('dichroic-shimmer')
    expect(visualEchoOf(bandOne(73)).effectVariant).toBe('orbiting-shards')
    expect(visualEchoOf(bandOne(81)).effectVariant).toBe('fractal-filigree')
    expect(visualEchoOf(bandOne(89)).effectVariant).toBe('arc-crown')
  })
})
