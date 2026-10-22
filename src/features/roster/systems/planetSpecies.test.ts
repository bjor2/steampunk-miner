import { describe, expect, it } from 'vitest'
import { freshPlanetParamsFor, ORE_RULES_VERSION } from '../../../systems/world/planetParams'
import { NO_KIND_SLOT } from '../../../systems/world/worldCell'
import { MATERIALS, type Material } from '../../materials'
import type { KindSlot } from '../../ores'
import { planetRosterOf } from './planetRoster'
import { planetSpeciesOf, speciesOfKind } from './planetSpecies'

// The species lookup of the planet-picks-pool seam (ticket 542, TD shape on #453, 6236465674): a
// slot resolves to the row of the planet's pool with its family, rarity and window. A row binds only
// under the ore rules span it names (ticket 736), so a swapped slot reads the species of the rules
// the planet was entered under.

const SEED = 83921
const RULES = ORE_RULES_VERSION
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
    expect(speciesOfKind('foothold-p3', SLOT, RULES, ROWS)?.id).toBe('p3-metal')
    expect(speciesOfKind('foothold-p4', SLOT, RULES, ROWS)?.id).toBe('p4-metal')
  })

  it("binds no species whose family, rarity or window is not the slot's", () => {
    expect(speciesOfKind('foothold-p5', SLOT, RULES, ROWS)).toBeNull()
    expect(speciesOfKind('foothold-p3', { ...SLOT, window: [3, 5] }, RULES, ROWS)).toBeNull()
    expect(speciesOfKind('foothold-p3', { ...SLOT, rarity: 'uncommon' }, RULES, ROWS)).toBeNull()
  })

  it('binds the retired species before its rules and the new one from them on the same slot', () => {
    const swapped = [
      rowOf('p3-old', 'foothold-p3', { beforeOreRules: 6 }),
      rowOf('p3-new', 'foothold-p3', { fromOreRules: 6 }),
    ]
    expect(speciesOfKind('foothold-p3', SLOT, 5, swapped)?.id).toBe('p3-old')
    expect(speciesOfKind('foothold-p3', SLOT, 6, swapped)?.id).toBe('p3-new')
    expect(speciesOfKind('foothold-p3', SLOT, undefined, swapped)?.id).toBe('p3-old')
  })

  it('binds no species of a pool the table does not hold', () => {
    expect(speciesOfKind('foothold-p6-p7', SLOT, RULES, ROWS)).toBeNull()
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
