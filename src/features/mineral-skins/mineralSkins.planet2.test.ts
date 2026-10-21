import { describe, expect, it } from 'vitest'
import { createAuthorityState } from '../../systems/authority/authorityState'
import { planetParamsOf } from '../../systems/authority/planetOfState'
import { freshPlanetParamsFor, type PlanetParams } from '../../systems/world/planetParams'
import { planetSpeciesOf } from '../roster'
import { planetSkinsOf } from './systems/mineralSkin'

// The P2 batches of #576 (tickets 595 to 597), re-scoped by the GD lock (b) on #595: planet 2's own
// species by roster slot, five a ticket, from the foothold-p2 pool of ticket 632 on the legacy kind
// slots. Ticket 595 skins slots 1 to 5, the pool's five commons (slate shale, rust ochre, tin
// gravel, sulphur crust, graphite seam); ticket 596 slots 6 to 9, its four uncommons (cobalt bloom,
// bismuth stair, moonstone lens, galena cube). A P2 entered before that pool, under ore rules 5,
// keeps the legacy species, so it keeps the skins planet 1 shows.

const SEED = 83921
const PLANET_2 = freshPlanetParamsFor(SEED, 2)
const SKINNED_SLOTS = [1, 2, 3, 4, 5, 6, 7, 8, 9]
/** The ore rules a P2 world was entered under before its own pool (ticket 632). */
const RULES_BEFORE_P2_POOL = 5

function planet2EnteredUnderRules5(): PlanetParams {
  const fresh = createAuthorityState({ planetIndex: 2, planetSeed: SEED, playerIds: ['p1'] })
  return planetParamsOf({ ...fresh.planet, oreRulesVersion: RULES_BEFORE_P2_POOL }) as PlanetParams
}

function skinnedSpeciesOf(params: PlanetParams): (string | null)[] {
  return planetSkinsOf(params).map((skin) => skin?.speciesId ?? null)
}

describe('mineral skins of planet 2', () => {
  it.each(SKINNED_SLOTS)('skins the own species of kind slot %i', (kindSlot) => {
    const species = planetSpeciesOf(PLANET_2, kindSlot)
    expect(species?.pool).toBe('foothold-p2')
    expect(planetSkinsOf(PLANET_2)[kindSlot - 1]?.speciesId).toBe(species?.id)
  })

  it('keeps the skins planet 1 shows on a planet 2 entered before its own pool', () => {
    expect(skinnedSpeciesOf(planet2EnteredUnderRules5())).toEqual(
      skinnedSpeciesOf(freshPlanetParamsFor(SEED, 1)),
    )
  })
})
