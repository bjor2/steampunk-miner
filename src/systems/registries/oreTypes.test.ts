import { describe, expect, it } from 'vitest'
import { RESOURCE_FAMILY } from '../world/worldCell'
import { ORE_TYPE_REGISTRY, oreTypeCatalogue, oreTypeOf, type OreType } from './oreTypes'
import { addToRegistry, withFreshRegistrySet } from './seal'

const nothing = () => undefined

const copperOre: OreType = {
  id: 'ores.copper',
  name: 'Copper',
  family: 'copper',
  cellFamily: RESOURCE_FAMILY.metal,
  tier: 3,
  grade: 1,
  iconId: 'ore-copper',
  requires: [],
}

function registerCopperProvider(): void {
  addToRegistry(ORE_TYPE_REGISTRY, 'ores', {
    id: 'ores.catalogue',
    oreTypeOf: () => copperOre,
    catalogue: () => [copperOre],
  })
}

describe('ore types registry', () => {
  it('names an ore by its cell family and tier with no provider', () => {
    const ore = withFreshRegistrySet(nothing, () =>
      oreTypeOf({ tier: 4, cellFamily: RESOURCE_FAMILY.crystal }),
    )
    expect(ore).toMatchObject({
      id: 'kernel.crystal.t4',
      family: 'crystal',
      tier: 4,
      grade: 0,
      requires: [],
    })
  })

  it('reads a metal cell as the metal default', () => {
    const ore = withFreshRegistrySet(nothing, () =>
      oreTypeOf({ tier: 1, cellFamily: RESOURCE_FAMILY.metal }),
    )
    expect(ore.id).toBe('kernel.metal.t1')
  })

  it("answers with the provider's ore when one is registered", () => {
    const ore = withFreshRegistrySet(registerCopperProvider, () =>
      oreTypeOf({ tier: 3, cellFamily: RESOURCE_FAMILY.metal }),
    )
    expect(ore).toBe(copperOre)
  })

  it("lists the provider's catalogue, and none with no provider", () => {
    expect(withFreshRegistrySet(registerCopperProvider, oreTypeCatalogue)).toEqual([copperOre])
    expect(withFreshRegistrySet(nothing, oreTypeCatalogue)).toEqual([])
  })
})
