import { describe, expect, it } from 'vitest'
import { VIEW_SHORT_AXIS_DEFAULT_M } from '../../constants/scene'
import glintFile from './gemGlint.json'
import {
  GEM_GLINT,
  GEM_GLINT_PIPS_MOST,
  gemGlintCodeOf,
  gemGlintLadderProblems,
  gemGlintOf,
  gemGlintOfCode,
  glintCoverageOf,
  glintReadProblemsAt,
  glintStepOf,
  glintTintOf,
  largestGemGlintCodeOf,
  loadGemGlintLadder,
  type GemGlint,
} from './gemGlint'

// Ticket 786 (GD lock on #746 item 2, TD done-when 6374381455): the glint is keyed on the gem's
// rank k alone, rises strictly over the authored steps within capped strength and coverage, holds
// the last step past them and shows those ranks as a finish cycle plus pips, at any k.

const STEPS = GEM_GLINT.steps.length
const TOP = STEPS - 1
const PIPS = GEM_GLINT.pips.most
const FINISHES = GEM_GLINT.finishes.length
const VERY_HIGH_RANK = 1e6
/** A tile at the default zoom on a phone's 360x640 and a desktop's 1280x800 (gem-read screens). */
const SCREEN_SHORT_SIDES_PX = [360, 800]

function glintsOfRanks(ranks: readonly number[]): GemGlint[] {
  return ranks.map((rank) => gemGlintOf(rank))
}

function isSameGlint(a: GemGlint, b: GemGlint): boolean {
  return a.step === b.step && a.pips === b.pips && a.finish === b.finish
}

function fileWith(change: Record<string, unknown>): Record<string, unknown> {
  return { ...glintFile, ...change }
}

describe('gem rank glint (ticket 786)', () => {
  it('ships a ladder whose strength, sparkle count and covered share rise strictly with k', () => {
    expect(gemGlintLadderProblems(glintFile)).toEqual([])
    GEM_GLINT.steps.slice(1).forEach((step, at) => {
      const below = GEM_GLINT.steps[at]
      expect(step.strength).toBeGreaterThan(below.strength)
      expect(step.sparkles).toBeGreaterThan(below.sparkles)
      expect(glintCoverageOf(step)).toBeGreaterThan(glintCoverageOf(below))
    })
  })

  it('keeps every step within the capped strength, sparkle count and coverage', () => {
    for (const step of GEM_GLINT.steps) {
      expect(step.strength).toBeLessThanOrEqual(GEM_GLINT.caps.strength)
      expect(step.sparkles).toBeLessThanOrEqual(GEM_GLINT.caps.sparkles)
      expect(glintCoverageOf(step)).toBeLessThanOrEqual(GEM_GLINT.caps.coverage)
    }
  })

  it('draws rank k on step k within the authored steps, with no pips and the ladder tint', () => {
    const ranks = GEM_GLINT.steps.map((_, rank) => rank)
    expect(glintsOfRanks(ranks)).toEqual(ranks.map((step) => ({ step, pips: 0, finish: 0 })))
    expect(glintTintOf(gemGlintOf(0))).toEqual(GEM_GLINT.tint)
  })

  it('holds the last step past the authored steps, so no rank grows brighter forever', () => {
    for (const rank of [STEPS, STEPS + PIPS, VERY_HIGH_RANK, Number.MAX_SAFE_INTEGER]) {
      expect(glintStepOf(gemGlintOf(rank))).toEqual(GEM_GLINT.steps[TOP])
    }
  })

  it('shows the ranks past the steps as 1 to 6 pips in the first finish, then the next finish', () => {
    const past = Array.from({ length: PIPS + 1 }, (_, at) => TOP + 1 + at)
    expect(glintsOfRanks(past)).toEqual([
      ...Array.from({ length: PIPS }, (_, at) => ({ step: TOP, pips: at + 1, finish: 1 })),
      { step: TOP, pips: 1, finish: 2 },
    ])
    expect(PIPS).toBeLessThanOrEqual(GEM_GLINT_PIPS_MOST)
  })

  it('starts the finish cycle over after the last finish', () => {
    const lap = PIPS * FINISHES
    expect(gemGlintOf(TOP + 1 + lap)).toEqual(gemGlintOf(TOP + 1))
    expect(glintTintOf(gemGlintOf(TOP + 1 + lap - 1))).toEqual(GEM_GLINT.finishes[FINISHES - 1])
  })

  it('never draws two neighbouring ranks alike, over two finish laps and at a very high k', () => {
    const ranks = [
      ...Array.from({ length: 2 * PIPS * FINISHES + STEPS }, (_, rank) => rank),
      VERY_HIGH_RANK,
      VERY_HIGH_RANK + 1,
    ]
    const glints = glintsOfRanks(ranks)
    const alike = glints.slice(1).filter((glint, at) => isSameGlint(glint, glints[at]))
    expect(alike).toEqual([])
  })

  it('carries k = 0, 1, 2, the step count and 1e6 as codes the table holds, read back whole', () => {
    for (const rank of [0, 1, 2, STEPS, VERY_HIGH_RANK]) {
      const glint = gemGlintOf(rank)
      const code = gemGlintCodeOf(glint)
      expect(code).toBeGreaterThan(0)
      expect(code).toBeLessThanOrEqual(largestGemGlintCodeOf())
      expect(gemGlintOfCode(code)).toEqual(glint)
    }
    expect(gemGlintOfCode(0)).toBe(null)
  })

  it('refuses a rank that is not a whole number from 0', () => {
    for (const rank of [-1, 0.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => gemGlintOf(rank)).toThrow(/whole number from 0/)
    }
  })

  it('adds a rank with a data row alone, keeping the ranks below it', () => {
    const fourth = { strength: 0.6, sparkles: 4, size: 0.075 }
    const steps = [
      { strength: 0.3, sparkles: 1, size: 0.06 },
      { strength: 0.4, sparkles: 2, size: 0.065 },
      { strength: 0.5, sparkles: 3, size: 0.07 },
      fourth,
    ]
    const ladder = loadGemGlintLadder(fileWith({ steps }))
    expect(gemGlintOf(3, ladder)).toEqual({ step: 3, pips: 0, finish: 0 })
    expect(glintStepOf(gemGlintOf(VERY_HIGH_RANK, ladder), ladder)).toEqual(fourth)
    expect(gemGlintOf(4, ladder)).toEqual({ step: 3, pips: 1, finish: 1 })
  })

  it('refuses a step whose strength, sparkles or covered share does not rise', () => {
    const [first, second, ...rest] = glintFile.steps
    const flat = { ...second, strength: first.strength, sparkles: first.sparkles, size: 0.01 }
    expect(gemGlintLadderProblems(fileWith({ steps: [first, flat, ...rest] }))).toEqual([
      'steps[1].strength must rise',
      'steps[1].sparkles must rise',
      'steps[1] must cover more',
    ])
  })

  it('refuses a step over the strength or coverage caps', () => {
    const [first, ...rest] = glintFile.steps
    const loud = { ...first, strength: 0.9, size: 0.2 }
    expect(gemGlintLadderProblems(fileWith({ steps: [loud, ...rest] }))).toEqual([
      'steps[0].strength is over caps.strength',
      'steps[0] covers over caps.coverage',
    ])
  })

  it('refuses more than 6 pips, or a row of them wider than the tile holds', () => {
    expect(
      gemGlintLadderProblems(fileWith({ pips: { most: 7, radius: 0.02, pitch: 0.05 } })),
    ).toEqual(['pips.most must be a whole number in 1..6'])
    expect(
      gemGlintLadderProblems(fileWith({ pips: { most: 6, radius: 0.04, pitch: 0.2 } })),
    ).toEqual(['a row of pips.most pips must fit in 0.8 of a tile'])
  })

  it('keeps every pip, gap and sparkle arm readable at 360 px and 1280+', () => {
    for (const shortSide of SCREEN_SHORT_SIDES_PX) {
      expect(glintReadProblemsAt(GEM_GLINT, shortSide / VIEW_SHORT_AXIS_DEFAULT_M)).toEqual([])
    }
  })

  it('names a pip too small to read on a phone', () => {
    const ladder = loadGemGlintLadder(fileWith({ pips: { most: 6, radius: 0.02, pitch: 0.1 } }))
    expect(glintReadProblemsAt(ladder, 30)).toEqual([
      'a pip draws 1.20 px at 30 px a tile, under 2',
    ])
  })
})
