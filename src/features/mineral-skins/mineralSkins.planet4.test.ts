import { describe, expect, it } from 'vitest'
import { freshPlanetParamsFor } from '../../systems/world/planetParams'
import { oreTierOf } from '../ores'
import { planetSpeciesOf } from '../roster'
import { planetSkinsOf, signatureSkinOf } from './systems/mineralSkin'

// The P4 batches of #576 (tickets 601 to 603): planet 4's species by roster slot, five a ticket,
// and the planet's signature material. Ticket 601 skins slots 1 to 5, the foothold-p4 pool's four
// commons (bog iron, cobalt bloom, rain quartz, canal jasper) and metal uncommon (antimony). Ticket
// 602 skins slots 6 to 10, its crystal and fossil uncommons (rose quartz, trilobite) and three
// rares (wire silver, watermelon tourmaline, belemnite). Ticket 603 skins slots 11 to 15, the three
// epics (clockspring steel, alexandrite, ichthyosaur eye) and two mythics (starsteel, painite), and
// dresses the relic signature. Slots 16 and 17 are #453's two appended fossil commons (grey marl,
// crinoid stem), whose skins are held: they wear none.

const PLANET_4 = freshPlanetParamsFor(83921, 4)
const SKINNED_SLOTS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]
const HELD_FOSSIL_SLOTS = [16, 17]

describe('mineral skins of planet 4', () => {
  it.each(SKINNED_SLOTS)('skins the species of kind slot %i', (kindSlot) => {
    const species = planetSpeciesOf(PLANET_4, kindSlot)
    expect(species).not.toBeNull()
    expect(planetSkinsOf(PLANET_4)[kindSlot - 1]?.speciesId).toBe(species?.id)
  })

  it.each(HELD_FOSSIL_SLOTS)(
    "holds the skin of #453's fossil common in kind slot %i",
    (kindSlot) => {
      expect(planetSpeciesOf(PLANET_4, kindSlot)?.family).toBe('fossil')
      expect(planetSkinsOf(PLANET_4)[kindSlot - 1]).toBeNull()
    },
  )

  it("dresses the planet's relic signature in its own skin", () => {
    expect(signatureSkinOf(PLANET_4)?.oreTypeId).toBe(`relic_t${oreTierOf(4, 5, 0)}`)
  })
})
