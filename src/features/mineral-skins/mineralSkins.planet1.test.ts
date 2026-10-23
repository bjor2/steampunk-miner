import { describe, expect, it } from 'vitest'
import { freshPlanetParamsFor } from '../../systems/world/planetParams'
import { planetSpeciesOf } from '../roster'
import { planetSkinsOf } from './systems/mineralSkin'

// The P1 batches of #576 (tickets 592 to 594): planet 1's species by roster slot, five a ticket.
// Ticket 592 skins slots 1 to 5, the five commons of the legacy pool; ticket 593 slots 6 to 10, its
// four uncommons and the first rare (vein gold); ticket 594 slots 11 and 12, its last two rares
// (blue corundum, red beryl). Ticket 713 adds P1's own three gems as slots 13 to 15 (Diamond,
// Emerald, Ruby, under ore rules 12) and skins them (batch p1-b4); a P1 entered under older rules
// keeps the 12.

const PLANET_1 = freshPlanetParamsFor(83921, 1)
const SKINNED_SLOTS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]
const GEM_SLOTS = [13, 14, 15]

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

  it('dresses each gem in a base, vein and sheen no other P1 species wears', () => {
    const skins = planetSkinsOf(PLANET_1)
    const layersOf = (kindSlot: number) => {
      const drawn = skins[kindSlot - 1]?.layers.filter((layer) => layer.kind !== 'palette') ?? []
      return drawn.map((layer) => `${layer.kind}/${layer.id}`)
    }
    const others = SKINNED_SLOTS.filter((slot) => !GEM_SLOTS.includes(slot)).flatMap(layersOf)
    const gems = GEM_SLOTS.flatMap(layersOf)
    expect(gems).toHaveLength(9)
    expect(gems.filter((id) => others.includes(id))).toEqual([])
    expect(new Set(gems).size).toBe(gems.length)
  })
})
