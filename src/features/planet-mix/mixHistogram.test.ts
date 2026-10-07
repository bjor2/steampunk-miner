import { describe, expect, it } from 'vitest'
import { PACING_WORLD_SEEDS } from '../../constants/pacingSeeds'
import { withRegistrations } from '../../registries/registrar'
import type { SliceDefinition } from '../../registries/sliceDefinition'
import { oreLeadHook, oreTypeProvider } from '../ores'
import { histogramProblems } from './histogramCheck'
import { planetHistogramOf } from './mixHistogram'

/**
 * #141 acceptance 1 on the planets that cover every case of the mix, generated whole on the three
 * pacing seeds with the features loaded as the game loads them: P2 (legacy stream), P3 (first mix,
 * no accent), P9 (Fire, accent, signature near lava), P30 (story planet) and P41 (first endless).
 * Every planet from 1 to 60 is `npm run ore:mix`. About a minute.
 */
const SEEDS = PACING_WORLD_SEEDS['bot-slice']
const PLANETS = [2, 3, 9, 30, 41]
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
    'matches the mix on P%i, pooled over the pacing seeds',
    (planet) => {
      const histograms = SEEDS.map((seed) => planetHistogramOf(planet, seed))
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
