import { describe, expect, it } from 'vitest'
import { freshPlanetParamsFor } from '../../systems/world/planetParams'
import { oreTierOf } from '../ores'
import { planetSpeciesOf } from '../roster'
import { planetSkinsOf, signatureSkinOf } from './systems/mineralSkin'

// The P5 batches of #576 (tickets 604 to 606): planet 5's species by roster slot, five a ticket,
// from the foothold-p5 pool, and the planet's signature material. Ticket 604 skins slots 1 to 5: the
// four commons (furnace iron, magnetite, selenite blade, ember agate) and the metal uncommon
// (chromite). Ticket 605 skins slots 6 to 10: the crystal and fossil uncommons (peridot, shark tooth)
// and the three rares (wolfram, fire garnet, saurian vertebra). Ticket 606 skins slots 11 to 15, the
// three epics (firebrass, heat spinel, petrified heartwood) and two mythics (core gold, furnace ruby),
// and dresses the relic signature. Slots 16 and 17 are #453's two appended fossil commons (coprolite,
// ash bed), whose skins are held: they wear none.

const PLANET_5 = freshPlanetParamsFor(83921, 5)
const SKINNED_SLOTS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]
const HELD_FOSSIL_SLOTS = [16, 17]

describe('mineral skins of planet 5', () => {
  it.each(SKINNED_SLOTS)('skins the species of kind slot %i', (kindSlot) => {
    const species = planetSpeciesOf(PLANET_5, kindSlot)
    expect(species).not.toBeNull()
    expect(planetSkinsOf(PLANET_5)[kindSlot - 1]?.speciesId).toBe(species?.id)
  })

  it.each(HELD_FOSSIL_SLOTS)(
    "holds the skin of #453's fossil common in kind slot %i",
    (kindSlot) => {
      expect(planetSpeciesOf(PLANET_5, kindSlot)?.family).toBe('fossil')
      expect(planetSkinsOf(PLANET_5)[kindSlot - 1]).toBeNull()
    },
  )

  it("dresses the planet's relic signature in its own skin", () => {
    expect(signatureSkinOf(PLANET_5)?.oreTypeId).toBe(`relic_t${oreTierOf(5, 5, 0)}`)
  })
})
