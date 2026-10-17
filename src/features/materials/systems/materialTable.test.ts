import { describe, expect, it } from 'vitest'
import { gateClassOf } from '../../planet-mix'
import materialsFile from '../materials.json'
import { MATERIAL_RARITIES } from './materialRowShape'
import {
  loadMaterialTable,
  MATERIALS,
  materialGateClassOf,
  materialGuardContext,
  materialTableProblems,
} from './materialTable'
import { brightestHostRockLuma } from './render/hostRockLuma'

// The guards of ticket 444 (#139 GD rulings 1, 2 and 5): a fixture table that passes, and one
// broken fixture per guard. The real rows land in later tickets and pass the same guards.

const CONTEXT = materialGuardContext()

const SLOTS = [
  { id: 'steel-blue', hue: 210, saturation: 0.15, luma: 0.6 },
  { id: 'ice-cyan', hue: 186, saturation: 0.5, luma: 0.72 },
]

const GILDED = {
  id: 'gilded-brassvein',
  pool: 'legacy',
  slot: 'legacy.c1',
  family: 'metal',
  epithet: 'Gilded',
  silhouette: 'flecks',
  pattern: 'banded',
  hueSlot: 'steel-blue',
  gradeBand: [1, 2],
  rarity: 'common',
  hero: false,
  flavour: 'Common seam stock, logged by the hundredweight at the Sell bay.',
}

const CLEAR = {
  id: 'clear-quartzine',
  pool: 'legacy',
  slot: 'legacy.r2',
  family: 'crystal',
  epithet: 'Clear',
  silhouette: 'shards',
  pattern: 'speckled',
  hueSlot: 'ice-cyan',
  gradeBand: [3, 5],
  rarity: 'rare',
  hero: true,
  flavour: 'Clean crystal, entered in the ledger with a careful hand.',
}

function tableWith(materials: unknown[], hueSlots: unknown[] = SLOTS): unknown {
  return { ...materialsFile, hueSlots, materials }
}

function problemsOf(materials: unknown[], hueSlots: unknown[] = SLOTS): string[] {
  return materialTableProblems(tableWith(materials, hueSlots), CONTEXT)
}

describe('materials table', () => {
  it('loads the committed table cleanly while it holds no rows', () => {
    expect(materialTableProblems(materialsFile, CONTEXT)).toEqual([])
    expect(MATERIALS.materials).toEqual([])
  })

  it('loads a fixture table sorted by id, naming each species after its family', () => {
    const table = loadMaterialTable(tableWith([GILDED, CLEAR]), CONTEXT)
    expect(table.materials.map((material) => [material.id, material.name])).toEqual([
      ['clear-quartzine', 'Clear Quartzine'],
      ['gilded-brassvein', 'Gilded Brassvein'],
    ])
    expect(table.hueSlots.map((slot) => slot.id)).toEqual(['ice-cyan', 'steel-blue'])
  })

  it('refuses a row whose fields break the schema, every problem at once', () => {
    const broken = { ...GILDED, id: 'Gilded_t1', gradeBand: [3, 2], hero: 'yes', pattern: '' }
    expect(problemsOf([broken])).toEqual([
      'materials[0].id must be kebab-case',
      'materials[0].pattern must name a kebab-case look id',
      'materials[0].gradeBand must be [first, last] in 1..5',
      'materials[0].hero must be true or false',
    ])
  })

  it('refuses a field the row shape does not name', () => {
    expect(problemsOf([{ ...GILDED, price: 12 }])).toEqual([
      'materials[0].price is not a material field',
    ])
  })

  it('refuses a row without a pool or a slot', () => {
    const bare = Object.fromEntries(
      Object.entries(GILDED).filter(([field]) => field !== 'pool' && field !== 'slot'),
    )
    expect(problemsOf([bare])).toEqual([
      'materials[0].pool must be a kebab-case pool id',
      'materials[0].slot must be a kind slot id of its pool (<pool>.<slot>)',
    ])
  })

  it('refuses a pool that is not a slug and a slot outside its pool', () => {
    expect(problemsOf([{ ...GILDED, pool: 'Legacy Pool', slot: 'legacy.c1' }])).toEqual([
      'materials[0].pool must be a kebab-case pool id',
      'materials[0].slot must be a kind slot id of its pool (<pool>.<slot>)',
    ])
    expect(problemsOf([{ ...GILDED, slot: 'foothold.c1' }])).toEqual([
      'materials[0].slot must be a kind slot id of its pool (<pool>.<slot>)',
    ])
  })

  it('refuses two species bound to the same kind slot of a pool', () => {
    expect(problemsOf([GILDED, { ...CLEAR, slot: GILDED.slot }])).toEqual([
      'clear-quartzine binds the kind slot legacy.c1 that gilded-brassvein already holds',
    ])
  })

  it('refuses two species sharing an id', () => {
    const twin = { ...CLEAR, id: GILDED.id }
    expect(problemsOf([GILDED, twin])).toEqual([
      'materials share the id gilded-brassvein; each needs its own',
    ])
  })

  it('refuses a family the ore catalogue does not list', () => {
    expect(problemsOf([{ ...GILDED, family: 'brass' }])).toEqual([
      'gilded-brassvein names the unknown family brass',
    ])
  })

  it('refuses a rarity outside the five tiers', () => {
    expect(problemsOf([{ ...GILDED, rarity: 'legendary' }])).toEqual([
      'materials[0].rarity must be one of common, uncommon, rare, epic, mythic',
    ])
  })

  it('refuses two species sharing silhouette, pattern and hue slot', () => {
    const lookalike = { ...CLEAR, silhouette: 'flecks', pattern: 'banded', hueSlot: 'steel-blue' }
    expect(problemsOf([GILDED, lookalike])).toEqual([
      'clear-quartzine shares silhouette flecks, pattern banded and hue slot steel-blue with gilded-brassvein',
    ])
  })

  it('lets two species share any two of silhouette, pattern and hue slot', () => {
    expect(problemsOf([GILDED, { ...CLEAR, silhouette: 'flecks', pattern: 'banded' }])).toEqual([])
  })

  it('refuses a row naming a hue slot the table does not hold', () => {
    expect(problemsOf([{ ...GILDED, hueSlot: 'ember-red' }])).toEqual([
      'gilded-brassvein names the unknown hue slot ember-red',
    ])
  })

  it('refuses hue slots in the reserved heat and enemy-purple bands, edges included', () => {
    const slots = [
      { ...SLOTS[0], hue: 15 },
      { ...SLOTS[1], hue: 285 },
    ]
    expect(problemsOf([], slots)).toEqual([
      'hueSlots[0].hue 15 falls in the reserved 15-45 degrees',
      'hueSlots[1].hue 285 falls in the reserved 268-285 degrees',
    ])
  })

  it('refuses a hue slot no brighter than the brightest host rock', () => {
    const luma = CONTEXT.hostRockLuma
    expect(problemsOf([], [{ ...SLOTS[0], luma }])).toEqual([
      `hueSlots[0].luma ${luma} is not above the host rock's ${luma.toFixed(3)}`,
    ])
  })

  it('refuses two hue slots sharing an id', () => {
    expect(problemsOf([], [SLOTS[0], { ...SLOTS[1], id: SLOTS[0].id }])).toEqual([
      'hueSlots share the id steel-blue; each needs its own',
    ])
  })

  it('refuses a gate class on a row, since the gate comes from the family only', () => {
    expect(problemsOf([{ ...CLEAR, gateClass: 'heat' }])).toEqual([
      'materials[0].gateClass is refused: the gate class comes from the family only (#142)',
    ])
  })

  it('gives every rarity of a family the family gate class', () => {
    const classes = MATERIAL_RARITIES.map((rarity) =>
      materialGateClassOf({ ...CLEAR, rarity } as { family: string }),
    )
    expect(new Set(classes)).toEqual(new Set([gateClassOf('crystal')]))
  })

  it('refuses a name over four words with its family name', () => {
    expect(problemsOf([{ ...GILDED, epithet: 'Old Deep Gilded Seam' }])).toEqual([
      'gilded-brassvein name "Old Deep Gilded Seam Brassvein" is 5 words, over 4',
    ])
  })

  it('refuses a flavour over twelve words', () => {
    const flavour = 'Brass seam stock, logged by the hundredweight and paid for at the Sell bay.'
    expect(problemsOf([{ ...GILDED, flavour }])).toEqual([
      'gilded-brassvein flavour is 14 words, over 12',
    ])
  })

  it('refuses a flavour out of the ledger voice', () => {
    expect(problemsOf([{ ...GILDED, flavour: 'The best ore in 3 bands' }])).toEqual([
      'gilded-brassvein flavour holds a digit; numbers belong on the stat lines',
      'gilded-brassvein flavour does not end in a full stop',
      'gilded-brassvein flavour uses the banned word "best"',
    ])
  })

  it('refuses a file without its two lists', () => {
    expect(materialTableProblems({}, CONTEXT)).toEqual(['materials and hueSlots must be lists'])
  })

  it('throws at load with every problem listed', () => {
    const broken = tableWith([{ ...GILDED, family: 'brass', gateClass: 'heat' }])
    expect(() => loadMaterialTable(broken, CONTEXT)).toThrow(
      /materials\.json is refused:\nmaterials\[0\]\.gateClass is refused/,
    )
  })
})

describe('host rock luma', () => {
  it('measures the brightest band of any palette, planet 1 band 1 at about 0.43 (#151)', () => {
    expect(brightestHostRockLuma()).toBeGreaterThan(0.43)
    expect(brightestHostRockLuma()).toBeLessThan(0.45)
  })
})
