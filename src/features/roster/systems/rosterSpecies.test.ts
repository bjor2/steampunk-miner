import { describe, expect, it } from 'vitest'
import { freshPlanetParamsFor } from '../../../systems/world/planetParams'
import { MATERIALS, type Material } from '../../materials'
import { ORE_ROWS, rarityRowSetOfPlanet, type KindSlot } from '../../ores'
import { planetRosterOf } from './planetRoster'

// The species-to-slot cross-check (TD ruling on ticket 446, 6226236698 section 1 and addendum
// 6226264758, rows of ticket 447): a species binds to a kind slot by `(pool, slot)`, its family,
// rarity and window equal the slot's, and every slot of the legacy table holds exactly one species.

const SEED = 83921
const ALL_SLOTS: readonly KindSlot[] = Object.values(ORE_ROWS.kinds.slotsBySet).flat()

function slotOf(material: Material): KindSlot | undefined {
  return ALL_SLOTS.find((slot) => slot.slotId === material.slot)
}

function matchesItsSlot(material: Material): boolean {
  const slot = slotOf(material)
  return (
    slot?.family === material.family &&
    slot.rarity === material.rarity &&
    slot.window.join('-') === material.gradeBand.join('-')
  )
}

function speciesOfSlot(pool: string, slotId: string): Material[] {
  return MATERIALS.materials.filter(
    (material) => material.pool === pool && material.slot === slotId,
  )
}

describe('roster species', () => {
  it('binds every species to a kind slot the ores kinds tables hold', () => {
    const unbound = MATERIALS.materials.filter((material) => slotOf(material) === undefined)
    expect(unbound.map((material) => material.id)).toEqual([])
  })

  it("gives every species its slot's family, rarity and window", () => {
    const mismatched = MATERIALS.materials.filter((material) => !matchesItsSlot(material))
    expect(mismatched.map((material) => material.id)).toEqual([])
  })

  it('holds exactly one legacy species in every slot of the legacy table', () => {
    const counts = ORE_ROWS.kinds.slotsBySet.legacy.map(
      (slot) => speciesOfSlot('legacy', slot.slotId).length,
    )
    expect(counts).toEqual(ORE_ROWS.kinds.slotsBySet.legacy.map(() => 1))
  })

  it('draws planets 1 and 2 from the legacy rows, every roster kind with its species', () => {
    for (const index of [1, 2]) {
      const params = freshPlanetParamsFor(SEED, index)
      expect(rarityRowSetOfPlanet(params)).toBe('legacy')
      const species = planetRosterOf(params).map((slot) => speciesOfSlot('legacy', slot.slotId))
      expect(species.map((found) => found.length)).toEqual(Array(12).fill(1))
    }
  })
})
