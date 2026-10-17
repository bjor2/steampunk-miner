import { describe, expect, it } from 'vitest'
import { freshPlanetParamsFor } from '../../systems/world/planetParams'
import { byteIdentitySeeds, maskedCountsOf, planetCensusOf, withRosterOff } from './rosterFixtures'

// Part A of `roster.byteIdentity.test` in full (TD ruling on ticket 446, 6226236698 section 5): on
// planets 1 to 5 and 64 seeds (8 named, 56 from a seeded stream), the roster fold off against on
// changes no masked cell, density, band count or family histogram. A lane (about 10 minutes): it
// runs only when named, `npx vitest run src/features/roster/roster.byteIdentity.lane.test.ts`.

const PLANETS = [1, 2, 3, 4, 5]
const PLANET_TIMEOUT_MS = 30 * 60 * 1000

describe('roster byte identity lane: A over 64 seeds', () => {
  it.each(PLANETS)(
    'leaves every masked cell, density and ore count of planet %i as the fold-off planet has it',
    (planetIndex) => {
      const moved = byteIdentitySeeds().filter((seed) => {
        const params = freshPlanetParamsFor(seed, planetIndex)
        const on = planetCensusOf(params)
        const off = withRosterOff(() => planetCensusOf(params))
        const isSameCounts =
          JSON.stringify(maskedCountsOf(on.rows)) === JSON.stringify(maskedCountsOf(off.rows))
        return on.maskedDigest !== off.maskedDigest || !isSameCounts
      })
      expect(moved).toEqual([])
    },
    PLANET_TIMEOUT_MS,
  )
})
