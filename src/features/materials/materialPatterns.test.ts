import { describe, expect, it } from 'vitest'
import { MATERIALS, type Material } from './systems/materialTable'

// Ticket 745 (spec #647, GD ruling of 23 Oct): P5's Heat Spinel drew Fire Garnet's `glowing` core,
// so the two pink crystals read as one species at phone size. The look guard of ticket 444 keeps
// only the whole triple (silhouette, pattern, hue slot) apart; this pins the shipped rows one step
// tighter, since a planet's species are its pool's (ticket 542): no two of them share a pattern.
// Fire Garnet keeps `glowing`; Heat Spinel wears the facet split instead.

function byPool(materials: readonly Material[]): Map<string, Material[]> {
  const pools = new Map<string, Material[]>()
  for (const material of materials)
    pools.set(material.pool, [...(pools.get(material.pool) ?? []), material])
  return pools
}

/** `<pool>: <pattern> on <id>, <id>` for every pattern two species of one pool draw. */
function sharedPatternsOf(materials: readonly Material[]): string[] {
  return [...byPool(materials)].flatMap(([pool, rows]) =>
    [...new Set(rows.map((row) => row.pattern))]
      .map((pattern) => ({ pattern, wearers: rows.filter((row) => row.pattern === pattern) }))
      .filter(({ wearers }) => wearers.length > 1)
      .map(
        ({ pattern, wearers }) =>
          `${pool}: ${pattern} on ${wearers.map((row) => row.id).join(', ')}`,
      ),
  )
}

function speciesOf(id: string): Material {
  const material = MATERIALS.materials.find((row) => row.id === id)
  if (material === undefined) throw new Error(`${id} is not in the materials table`)
  return material
}

describe('material patterns on a planet', () => {
  it('gives no two species of one pool the same pattern, so each reads apart at phone size', () => {
    expect(sharedPatternsOf(MATERIALS.materials)).toEqual([])
  })

  it("draws Heat Spinel's octahedra apart from Fire Garnet's glowing spheres (ticket 745)", () => {
    const heatSpinel = speciesOf('heat-spinel-quartzine')
    const fireGarnet = speciesOf('fire-garnet-quartzine')
    expect(fireGarnet.pattern).toBe('glowing')
    expect(heatSpinel.pattern).not.toBe(fireGarnet.pattern)
    expect(heatSpinel.silhouette).toBe('octahedra')
    expect(heatSpinel.hueSlot).toBe('heat-spinel')
  })
})
