import { describe, expect, it } from 'vitest'
import { MATERIALS, type Material } from './materialTable'
import { speciesNameOf } from './materialCopyRules'

// Ticket 699 (#576, Progression's rename table under GD lock): every species reads as its own
// mineral, so no two share a name anywhere in the solar system, and no two on one planet (one pool,
// ores.economy.json kinds.pools) share a sprite. Copy only: ids, prices and rarity stay.

function speciesByPool(): Map<string, Material[]> {
  const pools = new Map<string, Material[]>()
  for (const material of MATERIALS.materials) {
    pools.set(material.pool, [...(pools.get(material.pool) ?? []), material])
  }
  return pools
}

function repeatsOf(keys: readonly string[]): string[] {
  return keys.filter((key, index) => keys.indexOf(key) !== index)
}

function nameKeyOf(material: Material): string {
  return speciesNameOf(material.epithet).toLowerCase()
}

function spriteKeyOf(material: Material): string {
  return `${material.silhouette}|${material.pattern}`
}

describe('material names', () => {
  it('gives every species in the solar system a name no other species wears', () => {
    expect(repeatsOf(MATERIALS.materials.map(nameKeyOf))).toEqual([])
  })

  it.each([...speciesByPool()])('gives every %s species its own sprite', (_pool, species) => {
    expect(repeatsOf(species.map(spriteKeyOf))).toEqual([])
  })

  it('drops the colliding names of the rename table', () => {
    const renamed = new Map([
      ['p2-u1', 'Cobalt Bloom'],
      ['cobalt-bloom-brassvein', 'Erythrite Crust'],
      ['moonstone-quartzine', 'Lamp Feldspar'],
      ['furnace-ruby-quartzine', 'Kiln Ruby'],
      ['smoke-calcite-quartzine', 'Dogtooth Calcite'],
      ['deep-seam-tin-brassvein', 'Cassiterite'],
      ['step-bismuth-brassvein', 'Hopper Lattice'],
      ['salt-shell-amberbone', 'Brine Shell'],
      ['bog-iron-brassvein', 'Bog Limonite'],
      ['salt-iron-brassvein', 'Hematite Rose'],
      ['thunder-iron-brassvein', 'Fulgurite'],
    ])
    const epithetOf = (id: string) => MATERIALS.materials.find((row) => row.id === id)?.epithet
    expect(new Map([...renamed.keys()].map((id) => [id, epithetOf(id)]))).toEqual(renamed)
  })
})
