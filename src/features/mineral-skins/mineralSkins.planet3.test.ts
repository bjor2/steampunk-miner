import { describe, expect, it } from 'vitest'
import { freshPlanetParamsFor } from '../../systems/world/planetParams'
import { oreTierOf } from '../ores'
import { planetSpeciesOf } from '../roster'
import { planetSkinProblems, planetSkinsOf, signatureSkinOf } from './systems/mineralSkin'

// The P3 batches of #576 (tickets 598 to 600): planet 3's species by roster slot, five a ticket,
// from the foothold-p3 pool. Ticket 598 skins slots 1 to 5: the four commons (pig iron, soot zinc,
// rail quartz, smoke calcite) and the metal uncommon (step bismuth). Ticket 599 skins slots 6 to
// 10: the crystal and fossil uncommons
// (green apatite, ribbed shell) and the three rares (native platinum, blue topaz, coiled ammonite).
// Ticket 600 skins slots 11 to 15, the three epics and two mythics (meteoric iron, star sapphire,
// opal jaw, orichalcum, heart diamond), and dresses the planet's relic signature, the slotless
// 16th material. Slots 16 and 17 are #453's two fossil commons, held: no ticket skins them.

const PLANET_3 = freshPlanetParamsFor(83921, 3)
const SKINNED_SLOTS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]
const HELD_FOSSIL_SLOTS = [16, 17]
/** #141 "Signature": the act's signature family at the planet's band-5 tier. */
const RELIC_SIGNATURE_ON_3 = `relic_t${oreTierOf(3, 5, 0)}`

describe('mineral skins of planet 3', () => {
  it.each(SKINNED_SLOTS)('skins the species of kind slot %i', (kindSlot) => {
    const species = planetSpeciesOf(PLANET_3, kindSlot)
    expect(species).not.toBeNull()
    expect(planetSkinsOf(PLANET_3)[kindSlot - 1]?.speciesId).toBe(species?.id)
  })

  it.each(HELD_FOSSIL_SLOTS)(
    'leaves the held fossil common of kind slot %i unskinned',
    (kindSlot) => {
      expect(planetSpeciesOf(PLANET_3, kindSlot)?.family).toBe('fossil')
      expect(planetSkinsOf(PLANET_3)[kindSlot - 1]).toBeNull()
    },
  )

  it('dresses the relic signature of planet 3 in a skin of its own', () => {
    expect(signatureSkinOf(PLANET_3)?.oreTypeId).toBe(RELIC_SIGNATURE_ON_3)
  })

  it('gives the signature no combination a species of planet 3 wears', () => {
    expect(planetSkinProblems(PLANET_3)).toEqual([])
  })
})
