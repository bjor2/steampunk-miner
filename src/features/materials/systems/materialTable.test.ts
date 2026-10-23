import { describe, expect, it } from 'vitest'
import { ORE_RULES_VERSION } from '../../../systems/world/planetParams'
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
import { isSpeciesBoundUnder } from './materialOreRules'
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
  it('loads the committed table cleanly', () => {
    expect(materialTableProblems(materialsFile, CONTEXT)).toEqual([])
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
      'materials[0].slot must be a kind slot id (<table>.<slot>)',
    ])
  })

  it('refuses a pool that is not a slug and a slot that is not a kind slot id', () => {
    expect(problemsOf([{ ...GILDED, pool: 'Legacy Pool', slot: 'c1' }])).toEqual([
      'materials[0].pool must be a kebab-case pool id',
      'materials[0].slot must be a kind slot id (<table>.<slot>)',
    ])
  })

  it('lets an act pool bind the slots of a kinds table named otherwise', () => {
    expect(problemsOf([{ ...GILDED, pool: 'foothold', slot: 'mixed.c1' }])).toEqual([])
  })

  it('refuses two species bound to the same kind slot of a pool', () => {
    expect(problemsOf([GILDED, { ...CLEAR, slot: GILDED.slot }])).toEqual([
      'clear-quartzine binds the kind slot legacy.c1 that gilded-brassvein already holds',
    ])
  })

  it('lets two species share a kind slot of a pool under ore rules apart (ticket 736)', () => {
    const retired = { ...GILDED, beforeOreRules: 9 }
    const swapped = { ...CLEAR, slot: GILDED.slot, fromOreRules: 9 }
    expect(problemsOf([retired, swapped])).toEqual([])
  })

  it('refuses two species of one slot whose ore rules spans overlap', () => {
    const retired = { ...GILDED, beforeOreRules: 9 }
    const swapped = { ...CLEAR, slot: GILDED.slot, fromOreRules: 8 }
    expect(problemsOf([retired, swapped])).toEqual([
      'clear-quartzine binds the kind slot legacy.c1 that gilded-brassvein already holds',
    ])
  })

  it('refuses an ore rules span this build does not know or that binds under none', () => {
    expect(problemsOf([{ ...GILDED, fromOreRules: 1, beforeOreRules: 99 }])).toEqual([
      `materials[0].fromOreRules must be an ore rules version from 2 to ${ORE_RULES_VERSION}`,
      `materials[0].beforeOreRules must be an ore rules version from 2 to ${ORE_RULES_VERSION}`,
    ])
    expect(problemsOf([{ ...GILDED, fromOreRules: 6, beforeOreRules: 6 }])).toEqual([
      'materials[0] binds under no ore rules: fromOreRules is not before beforeOreRules',
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

describe('materials table look ids (ticket 450)', () => {
  it('refuses a silhouette or pattern the terrain shader cannot draw', () => {
    const unknown = { ...GILDED, silhouette: 'tentacles', pattern: 'plaid' }
    expect(problemsOf([unknown])).toEqual([
      'gilded-brassvein names the silhouette tentacles the shader cannot draw',
      'gilded-brassvein names the pattern plaid the shader cannot draw',
    ])
  })
})

describe('host rock luma', () => {
  it('measures the brightest band of any palette, planet 1 band 1 at about 0.43 (#151)', () => {
    expect(brightestHostRockLuma()).toBeGreaterThan(0.43)
    expect(brightestHostRockLuma()).toBeLessThan(0.45)
  })
})

// Ticket 447 (#139, Systems' split on #446): the 12 species P1 and P2 share, 5 common, 4 uncommon
// and 3 rare, metal and crystal only, every one its own look and none in a reserved hue band.
describe('legacy materials', () => {
  const legacy = MATERIALS.materials.filter((material) => material.pool === 'legacy')

  function countOf(rarity: string): number {
    return legacy.filter((material) => material.rarity === rarity).length
  }

  it('holds 12 species split 5 common, 4 uncommon and 3 rare, with no epic or mythic', () => {
    expect(legacy).toHaveLength(12)
    expect(MATERIAL_RARITIES.map(countOf)).toEqual([5, 4, 3, 0, 0])
  })

  it('draws only on the metal and crystal families', () => {
    expect(new Set(legacy.map((material) => material.family))).toEqual(
      new Set(['metal', 'crystal']),
    )
  })

  it('keeps every hue slot out of the 15-45 and 268-285 degree bands', () => {
    const hues = MATERIALS.hueSlots.map((slot) => slot.hue)
    expect(hues.filter((hue) => (hue >= 15 && hue <= 45) || (hue >= 268 && hue <= 285))).toEqual([])
  })

  it('gives every species its own hue slot', () => {
    expect(new Set(legacy.map((material) => material.hueSlot)).size).toBe(legacy.length)
  })
})

// Ticket 632 (GD lock (b) on #595, Progression's species list): P2's own 12 species, one on each
// legacy kind slot with that slot's family, rarity and window, ids `p2-<slot>`, every one a look no
// other species wears, and no hero until hero art packs one into P2's atlas, which ticket 744 did
// for the three gem rows (Star Garnet, Verdigris Opal, Aquamarine). Ticket 709 (GD ruling
// (A) on #709, Progression's names) adds three on the pool's own slots: Cinnabar, Aquamarine, Jet.
// Ticket 736 (GD lock on #736) swaps three shared slots like for like under the same ore rules 9:
// Azurite Nodule, Pyrite Sun and Argentite take the slots of Cobalt Bloom, Bismuth Stair and Smoke
// Diamond, which a P2 entered under older rules keeps, each a new id `p2-<slot>b`.
describe('foothold-p2 materials', () => {
  const p2 = MATERIALS.materials.filter((material) => material.pool === 'foothold-p2')
  const legacy = MATERIALS.materials.filter((material) => material.pool === 'legacy')
  const OWN_SLOTS = ['legacy.u5', 'legacy.r4', 'legacy.r5']
  const SWAPPED_SLOTS = ['legacy.u1', 'legacy.u2', 'legacy.r3']
  const SWAP_RULES = 9
  const boundUnder = (rules: number) =>
    p2.filter((material) => isSpeciesBoundUnder(material, rules))
  const onShared = boundUnder(SWAP_RULES - 1).filter(
    (material) => !OWN_SLOTS.includes(material.slot),
  )
  const swappedIn = p2.filter((material) => material.fromOreRules === SWAP_RULES)

  it('puts one species on each legacy slot and its own three, 5 common, 5 uncommon and 5 rare', () => {
    const fresh = boundUnder(SWAP_RULES)
    const slots = fresh.map((material) => material.slot).sort()
    expect(slots).toEqual([...legacy.map((material) => material.slot), ...OWN_SLOTS].sort())
    const countOf = (rarity: string) =>
      fresh.filter((material) => material.rarity === rarity).length
    expect(MATERIAL_RARITIES.map(countOf)).toEqual([5, 5, 5, 0, 0])
  })

  it("ids each slot's first species p2-<slot> and its swapped-in species p2-<slot>b", () => {
    const idOf = (material: (typeof p2)[number]) =>
      `p2-${material.slot.replace('legacy.', '')}${swappedIn.includes(material) ? 'b' : ''}`
    expect(p2.map((material) => material.id)).toEqual(p2.map(idOf))
  })

  it('swaps Azurite Nodule, Pyrite Sun and Argentite in from ore rules 9 and keeps the retired three before', () => {
    const speciesOn = (rules: number) =>
      SWAPPED_SLOTS.map(
        (slot) => boundUnder(rules).find((material) => material.slot === slot)?.epithet,
      )
    expect(speciesOn(SWAP_RULES - 1)).toEqual(['Cobalt Bloom', 'Bismuth Stair', 'Smoke Diamond'])
    expect(speciesOn(SWAP_RULES)).toEqual(['Azurite Nodule', 'Pyrite Sun', 'Argentite'])
  })

  it('keeps the family, rarity and band window of the slot on each swapped-in species', () => {
    const descriptorOf = ({ slot, family, rarity, gradeBand }: (typeof p2)[number]) =>
      `${slot} ${family} ${rarity} ${gradeBand.join('-')}`
    const retiredOf = (slot: string) =>
      onShared.find((material) => material.slot === slot) as (typeof p2)[number]
    expect(swappedIn.map(descriptorOf)).toEqual(
      swappedIn.map((material) => descriptorOf(retiredOf(material.slot))),
    )
  })

  it("keeps the family, rarity and band window of the legacy species on the species' slot", () => {
    const descriptorOf = ({ slot, family, rarity, gradeBand }: (typeof p2)[number]) =>
      `${slot} ${family} ${rarity} ${gradeBand.join('-')}`
    expect(onShared.map(descriptorOf).sort()).toEqual(legacy.map(descriptorOf).sort())
  })

  it('names the own three as Progression posted them, a metal uncommon and two crystal rares in bands 4-5', () => {
    const ownOf = (slot: string) => p2.find((material) => material.slot === slot)
    expect(
      OWN_SLOTS.map(ownOf).map((material) => [
        material?.epithet,
        material?.family,
        material?.rarity,
        material?.gradeBand.join('-'),
      ]),
    ).toEqual([
      ['Cinnabar', 'metal', 'uncommon', '4-5'],
      ['Aquamarine', 'crystal', 'rare', '4-5'],
      ['Jet', 'crystal', 'rare', '4-5'],
    ])
  })

  it('gives every species its own hue slot and a silhouette and pattern pair no other wears', () => {
    const lookKeysOf = (rows: readonly (typeof p2)[number][]) =>
      rows.flatMap((material) => [material.hueSlot, `${material.silhouette}|${material.pattern}`])
    const others = lookKeysOf(
      MATERIALS.materials.filter((material) => material.pool !== 'foothold-p2'),
    )
    const own = lookKeysOf(p2)
    expect(own.filter((key) => others.includes(key))).toEqual([])
    expect(new Set(own).size).toBe(own.length)
  })

  it('marks the three gem rows heroes (ticket 744); every other species draws its procedural look', () => {
    expect(p2.filter((material) => material.hero).map((material) => material.id)).toEqual([
      'p2-r1',
      'p2-r2',
      'p2-r4',
    ])
  })
})

// #453 (Systems' kinds.mixed, 6235087481, with Option B; the per-planet pools of ticket 542): each
// foothold pool holds a species for every mixed slot, 4/3/3/3/2 plus two fossil commons for a
// swapped band 3, under the act's metal, crystal and fossil families, each with a look of its own.
describe('foothold materials', () => {
  const POOLS = ['foothold-p3', 'foothold-p4', 'foothold-p5', 'foothold-p6-p7']
  const foothold = MATERIALS.materials.filter((material) => POOLS.includes(material.pool))

  function speciesOf(pool: string) {
    return foothold.filter((material) => material.pool === pool)
  }

  it.each(POOLS)('holds 17 %s species: 6 common, 3 uncommon, 3 rare, 3 epic, 2 mythic', (pool) => {
    const count = (rarity: string) =>
      speciesOf(pool).filter((material) => material.rarity === rarity).length
    expect(MATERIAL_RARITIES.map(count)).toEqual([6, 3, 3, 3, 2])
  })

  it('draws only on the metal, crystal and fossil families', () => {
    expect(new Set(foothold.map((material) => material.family))).toEqual(
      new Set(['metal', 'crystal', 'fossil']),
    )
  })

  it('gives every foothold species its own hue slot, apart from every other species', () => {
    const hueSlots = MATERIALS.materials.map((material) => material.hueSlot)
    const shared = foothold.filter(
      (material) => hueSlots.indexOf(material.hueSlot) !== hueSlots.lastIndexOf(material.hueSlot),
    )
    expect(shared.map((material) => material.id)).toEqual([])
  })

  it('gives every foothold species a silhouette and pattern pair no other species wears', () => {
    const pairs = MATERIALS.materials.map(
      (material) => `${material.silhouette}|${material.pattern}`,
    )
    const shared = foothold.filter((material) => {
      const pair = `${material.silhouette}|${material.pattern}`
      return pairs.indexOf(pair) !== pairs.lastIndexOf(pair)
    })
    expect(shared.map((material) => material.id)).toEqual([])
  })
})
