import { describe, expect, it } from 'vitest'
import { freshPlanetParamsFor } from '../../systems/world/planetParams'
import { planetSpeciesOf } from '../roster'
import { planetSkinsOf } from './systems/mineralSkin'

// The P3 batches of #576 (tickets 598 to 600): planet 3's species by roster slot, five a ticket,
// from the foothold-p3 pool. Ticket 599 skins slots 6 to 10: the crystal and fossil uncommons
// (green apatite, ribbed shell) and the three rares (native platinum, blue topaz, coiled ammonite).
// Slots 16 and 17 are #453's two fossil commons, held: no ticket skins them.

const PLANET_3 = freshPlanetParamsFor(83921, 3)
const SKINNED_SLOTS = [6, 7, 8, 9, 10]
const HELD_FOSSIL_SLOTS = [16, 17]

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
})
