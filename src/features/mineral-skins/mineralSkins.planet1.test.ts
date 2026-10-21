import { describe, expect, it } from 'vitest'
import { freshPlanetParamsFor } from '../../systems/world/planetParams'
import { planetSpeciesOf } from '../roster'
import { planetSkinsOf } from './systems/mineralSkin'

// The P1 batches of #576 (tickets 592 to 594): planet 1's species by roster slot, five a ticket.
// Ticket 592 skins slots 1 to 5, the five commons of the legacy pool; ticket 593 slots 6 to 10, its
// four uncommons and the first rare (vein gold); ticket 594 slots 11 and 12, its last two rares
// (blue corundum, red beryl). The legacy pool has 12 species, so P1 has no slots 13 to 15.

const PLANET_1 = freshPlanetParamsFor(83921, 1)
const SKINNED_SLOTS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]

describe('mineral skins of planet 1', () => {
  it.each(SKINNED_SLOTS)('skins the species of kind slot %i', (kindSlot) => {
    const species = planetSpeciesOf(PLANET_1, kindSlot)
    expect(species).not.toBeNull()
    expect(planetSkinsOf(PLANET_1)[kindSlot - 1]?.speciesId).toBe(species?.id)
  })

  it('skins every kind slot of the planet', () => {
    expect(planetSkinsOf(PLANET_1).map((skin) => skin?.speciesId ?? null)).toEqual(
      SKINNED_SLOTS.map((kindSlot) => planetSpeciesOf(PLANET_1, kindSlot)?.id),
    )
  })
})
