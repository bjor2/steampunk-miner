import { describe, expect, it } from 'vitest'
import { freshPlanetParamsFor } from '../../systems/world/planetParams'
import { NAMED_SEEDS, planetCellDigestOf } from './rosterFixtures'

// The PR assertion of the planet-picks-pool seam (ticket 542, TD shape on #453, 6236465674): the
// seam is look only, so every cell word of a seeded planet P1 to P7, kind slot included, is what
// main made before it, with the legacy rows on their current pool. No ORE_RULES_VERSION,
// GENERATOR_VERSION or protocol change goes with it. One seed: a whole planet takes 2 to 4 s.

const SEED = NAMED_SEEDS[0]
const PLANETS = [1, 2, 3, 4, 5, 6, 7]
const PLANET_TIMEOUT_MS = 120_000

/** Each planet's whole-cell digest on the first named seed, main at b095175e before the seam. */
const MAIN_CELL_DIGESTS: Readonly<Record<number, string>> = {
  1: '7e596f75431c827d',
  2: '924c2660b3458533',
  3: 'da330a0c87eec7ee',
  4: '1da9524797297920',
  5: '5affb7e9b6beafe7',
  6: 'b6f647c6c18e7d39',
  7: '3c5d9f74e0119302',
}

describe('roster pool seam', () => {
  it.each(PLANETS)(
    'leaves every cell word of planet %i as main made it before the seam',
    (planetIndex) => {
      const digest = planetCellDigestOf(freshPlanetParamsFor(SEED, planetIndex))
      expect(digest).toBe(MAIN_CELL_DIGESTS[planetIndex])
    },
    PLANET_TIMEOUT_MS,
  )
})
