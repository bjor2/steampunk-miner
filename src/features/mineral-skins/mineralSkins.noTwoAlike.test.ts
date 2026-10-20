import { describe, expect, it } from 'vitest'
import { withRegistrations } from '../../registries/registrar'
import { authorityReactions } from '../../systems/registries/authorityReactions'
import { generationHooks } from '../../systems/registries/generationHooks'
import { saveSectionsOf } from '../../systems/registries/saveSections'
import { freshPlanetParamsFor } from '../../systems/world/planetParams'
import { ORE_ROWS } from '../ores'
import { planetSkinProblems } from './systems/mineralSkin'
import { slice } from './register'

// Ticket 591's acceptance on the shipped skins (#576, GD ruling 20 Oct 2026): no two species on one
// planet share a skin combination, on every planet a species pool covers; and the skins are look
// only, so the slice adds nothing that could move the generator, a stored cell or a digest.

/** Two of the roster's named seeds; a planet's roster and pool never read the seed. */
const [SEED, SECOND_SEED] = [83921, 4294967295]

/** Every planet a species pool covers (ticket 542): P1 and P2 legacy, P3 to P7 the foothold pools. */
const POOLED_PLANETS = [...ORE_ROWS.kinds.poolByPlanet.keys()]

describe('mineral skins on the planets', () => {
  it.each(POOLED_PLANETS)('gives no two species of planet %i one skin combination', (index) => {
    expect(planetSkinProblems(freshPlanetParamsFor(SEED, index))).toEqual([])
    expect(planetSkinProblems(freshPlanetParamsFor(SECOND_SEED, index))).toEqual([])
  })

  it('registers no generation hook, authority reaction or save section', () => {
    withRegistrations([slice], () => {
      expect(generationHooks()).toEqual([])
      expect(authorityReactions()).toEqual([])
      expect([...saveSectionsOf('session'), ...saveSectionsOf('player')]).toEqual([])
    })
  })
})
