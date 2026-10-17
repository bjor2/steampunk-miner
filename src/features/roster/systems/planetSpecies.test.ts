import { describe, expect, it } from 'vitest'
import { freshPlanetParamsFor } from '../../../systems/world/planetParams'
import { NO_KIND_SLOT } from '../../../systems/world/worldCell'
import { MATERIALS, type Material } from '../../materials'
import type { KindSlot } from '../../ores'
import { planetRosterOf } from './planetRoster'
import { planetSpeciesOf, speciesOfKind } from './planetSpecies'

// The species lookup of the planet-picks-pool seam (ticket 542, TD shape on #453, 6236465674): a
// slot resolves to the row of the planet's pool with its family, rarity and window.

const SEED = 83921
const SLOT: KindSlot = { slotId: 'mixed.c1', family: 'metal', rarity: 'common', window: [1, 5] }
const [LEGACY_ROW] = MATERIALS.materials

function rowOf(id: string, pool: string, changes: Partial<Material> = {}): Material {
  return {
    ...LEGACY_ROW,
    id,
    pool,
    slot: 'mixed.c1',
    family: 'metal',
    rarity: 'common',
    gradeBand: [1, 5],
    ...changes,
  }
}

const ROWS: readonly Material[] = [
  rowOf('p3-metal', 'foothold-p3'),
  rowOf('p4-metal', 'foothold-p4'),
  rowOf('p5-crystal', 'foothold-p5', { family: 'crystal' }),
]

describe('planet species', () => {
  it("resolves one shared slot to each pool's own species", () => {
    expect(speciesOfKind('foothold-p3', SLOT, ROWS)?.id).toBe('p3-metal')
    expect(speciesOfKind('foothold-p4', SLOT, ROWS)?.id).toBe('p4-metal')
  })

  it("binds no species whose family, rarity or window is not the slot's", () => {
    expect(speciesOfKind('foothold-p5', SLOT, ROWS)).toBeNull()
    expect(speciesOfKind('foothold-p3', { ...SLOT, window: [3, 5] }, ROWS)).toBeNull()
    expect(speciesOfKind('foothold-p3', { ...SLOT, rarity: 'uncommon' }, ROWS)).toBeNull()
  })

  it('binds no species of a pool the table does not hold', () => {
    expect(speciesOfKind('foothold-p6-p7', SLOT, ROWS)).toBeNull()
  })

  it('reads every stored kind slot of planet 1 back as the legacy species of that slot', () => {
    const params = freshPlanetParamsFor(SEED, 1)
    const species = planetRosterOf(params).map((_, at) => planetSpeciesOf(params, at + 1))
    expect(species.map((found) => found?.pool)).toEqual(Array(12).fill('legacy'))
    expect(species.map((found) => found?.slot)).toEqual(
      planetRosterOf(params).map((slot) => slot.slotId),
    )
  })

  it('reads no species for a cell without a kind', () => {
    expect(planetSpeciesOf(freshPlanetParamsFor(SEED, 2), NO_KIND_SLOT)).toBeNull()
  })

  it('reads no species past planet 7, where no pool binds', () => {
    expect(planetSpeciesOf(freshPlanetParamsFor(SEED, 8), 1)).toBeNull()
  })
})
