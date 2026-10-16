import { describe, expect, it } from 'vitest'
import { PACING_WORLD_SEEDS } from '../../constants/pacingSeeds'
import { withRegistrations } from '../../registries/registrar'
import type { SliceDefinition } from '../../registries/sliceDefinition'
import { planetParamsFor } from '../../systems/world/planetParams'
import { oreLeadHook, oreTypeProvider } from '../ores'
import { histogramProblems } from './histogramCheck'
import { planetHistogramOf, planetHistogramOfParams } from './mixHistogram'

/**
 * #141 acceptance 1 on the planets that cover every case of the mix, generated whole on the three
 * pacing seeds with the features loaded as the game loads them: P2 (legacy stream), P3 (first mix,
 * no accent), P9 (Fire, accent, signature near lava), P30 (story planet) and P41 (first endless).
 * Every planet from 1 to 60 is `npm run ore:mix`. About three minutes.
 *
 * Both row sets (ticket 445): the legacy rows of a planet a save holds without the ore rules, and
 * the mixed rows of a planet entered fresh. The story planet's doubled signature on the mixed rows
 * is judged over 16 seeds: its band 5 holds about 160 patches, and on the three pacing seeds the
 * signature's 600 bp share lands at 961 bp, past three standard errors (617 bp over 16 seeds).
 */
const SEEDS = PACING_WORLD_SEEDS['bot-slice']
const PLANETS = [2, 3, 9, 30, 41]
const FRESH_PLANETS = [3, 9, 41]
const STORY_PLANET = 30
const STORY_SEEDS = Array.from({ length: 16 }, (_, at) => 1000 + at)
const MINUTES = 60_000

const leadOnly: readonly SliceDefinition[] = [
  {
    id: 'ores',
    register: (r) => {
      r.oreTypes(oreTypeProvider)
      r.generationHook(oreLeadHook)
    },
  },
]

describe('planet ore histogram', () => {
  it.each(PLANETS)(
    'matches the mix on P%i on the legacy rows, pooled over the pacing seeds',
    (planet) => {
      const histograms = SEEDS.map((seed) => planetHistogramOfParams(planetParamsFor(seed, planet)))
      expect(histogramProblems(histograms)).toEqual([])
    },
    5 * MINUTES,
  )

  it.each(FRESH_PLANETS)(
    'matches the mix on a fresh P%i, pooled over the pacing seeds',
    (planet) => {
      const histograms = SEEDS.map((seed) => planetHistogramOf(planet, seed))
      expect(histograms.every((histogram) => histogram.oreRulesVersion === 1)).toBe(true)
      expect(histogramProblems(histograms)).toEqual([])
    },
    5 * MINUTES,
  )

  it(
    'matches the mix on a fresh story planet, pooled over 16 seeds',
    () => {
      const histograms = STORY_SEEDS.map((seed) => planetHistogramOf(STORY_PLANET, seed))
      expect(histogramProblems(histograms)).toEqual([])
    },
    5 * MINUTES,
  )

  it('paints signature cells only in bands 4 and 5 of a mixed planet', () => {
    const { bands } = planetHistogramOf(9, SEEDS[0])
    const signatureBands = bands
      .filter((band) => band.types.some((type) => type.role === 'signature'))
      .map((band) => band.band)
    expect(signatureBands).toEqual([4, 5])
  })

  it('misses the mix on a planet generated without the fold', () => {
    const problems = withRegistrations(leadOnly, () =>
      histogramProblems([planetHistogramOf(3, SEEDS[0])]),
    )
    expect(problems).toContain('P3 band 4: signature 0 bp, expected 300 bp')
  })
})
