import { describe, expect, it } from 'vitest'
import { freshPlanetParamsFor, planetParamsFor } from '../../../systems/world/planetParams'
import { MATERIALS, type Material } from '../../materials'
import { ORE_ROWS, rarityRowSetOfPlanet, type KindSlot } from '../../ores'
import { planetRosterOf, poolOfPlanet } from './planetRoster'

// The species-to-slot cross-check (TD ruling on ticket 446, 6226236698 section 1 and addendum
// 6226264758, rows of ticket 447): a species binds to a kind slot by `(pool, slot)`, its family,
// rarity and window equal the slot's, and every slot of the legacy table holds exactly one species.
// The pool guard of ticket 542 (TD shape on #453, 6236465674): every pool of `planets.rows` holds
// exactly one species for every slot a planet of it can ask for, and no species row's pool is
// unmapped. P2's own pool (ticket 632, GD lock (b) on #595) binds the legacy slots, and a P2 a save
// holds under ore rules 5 or earlier keeps the legacy species.

const SEED = 83921
const ALL_SLOTS: readonly KindSlot[] = Object.values(ORE_ROWS.kinds.slotsBySet).flat()
const POOL_BY_PLANET = ORE_ROWS.kinds.poolByPlanet
const MAPPED_POOLS = [...new Set(POOL_BY_PLANET.values())]

/** Every slot a planet of the pool can ask for: the union of those planets' rosters. */
function slotIdsAskedOf(pool: string): string[] {
  const planets = [...POOL_BY_PLANET].filter(([, mapped]) => mapped === pool)
  const asked = planets.flatMap(([index]) =>
    planetRosterOf(freshPlanetParamsFor(SEED, index)).map((slot) => slot.slotId),
  )
  return [...new Set(asked)]
}

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

  it.each([
    { planet: 'planet 1', params: freshPlanetParamsFor(SEED, 1), pool: 'legacy' },
    { planet: 'a fresh planet 2', params: freshPlanetParamsFor(SEED, 2), pool: 'foothold-p2' },
    { planet: 'planet 2 under ore rules 5', params: planetParamsFor(SEED, 2, 5), pool: 'legacy' },
  ])(
    'draws $planet from the legacy rows and the $pool pool, every kind its species',
    ({ params, pool }) => {
      expect(rarityRowSetOfPlanet(params)).toBe('legacy')
      expect(poolOfPlanet(params)).toBe(pool)
      const species = planetRosterOf(params).map((slot) => speciesOfSlot(pool, slot.slotId))
      expect(species.map((found) => found.length)).toEqual(Array(12).fill(1))
    },
  )

  it('maps every planet from 1 to 7 to a pool', () => {
    const unmapped = [1, 2, 3, 4, 5, 6, 7].filter(
      (index) => poolOfPlanet(freshPlanetParamsFor(SEED, index)) === null,
    )
    expect(unmapped).toEqual([])
  })

  it.each(MAPPED_POOLS)(
    'holds exactly one %s species in every slot a planet of that pool can ask for',
    (pool) => {
      const counts = slotIdsAskedOf(pool).map((slotId) => speciesOfSlot(pool, slotId).length)
      expect(counts).toEqual(counts.map(() => 1))
    },
  )

  it('maps the pool of every species row to a planet', () => {
    const unmapped = MATERIALS.materials.filter((material) => !MAPPED_POOLS.includes(material.pool))
    expect(unmapped.map((material) => material.id)).toEqual([])
  })
})
