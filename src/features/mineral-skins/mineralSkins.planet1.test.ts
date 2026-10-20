import { describe, expect, it } from 'vitest'
import { freshPlanetParamsFor } from '../../systems/world/planetParams'
import { planetSpeciesOf } from '../roster'
import { planetSkinsOf } from './systems/mineralSkin'

// The P1 batches of #576 (tickets 592 to 594): planet 1's species by roster slot, five a ticket.
// Ticket 592 skins slots 1 to 5, the five commons of the legacy pool.

const PLANET_1 = freshPlanetParamsFor(83921, 1)
const BATCH_1_SLOTS = [1, 2, 3, 4, 5]

describe('mineral skins of planet 1', () => {
  it.each(BATCH_1_SLOTS)('skins the species of kind slot %i', (kindSlot) => {
    const species = planetSpeciesOf(PLANET_1, kindSlot)
    expect(species).not.toBeNull()
    expect(planetSkinsOf(PLANET_1)[kindSlot - 1]?.speciesId).toBe(species?.id)
  })
})
