import { describe, expect, it } from 'vitest'
import { RESOURCE_FAMILY } from '../world/worldCell'
import {
  KERNEL_ORE_INDEX_TAG,
  ORE_TYPE_REGISTRY,
  oreBitIndexOf,
  oreIndexTag,
  oreTypeCatalogue,
  oreTypeOf,
  type OreType,
} from './oreTypes'
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
    indexTag: 'ores.type-id',
    oreTypeOf: () => copperOre,
    bitIndexOf: () => 7,
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

const KERNEL_TIERS = Array.from({ length: 30 }, (_, at) => at + 1)
const CELL_FAMILIES = [RESOURCE_FAMILY.metal, RESOURCE_FAMILY.crystal]

/** The kernel default's bit for an ore of this tier and cell family. */
function kernelBitOf(tier: number, cellFamily: (typeof CELL_FAMILIES)[number]): number {
  return withFreshRegistrySet(nothing, () => oreBitIndexOf(oreTypeOf({ tier, cellFamily })))
}

describe('ore bit index', () => {
  it('gives metal and crystal of the same tier separate bits with no provider', () => {
    expect(kernelBitOf(5, RESOURCE_FAMILY.metal)).toBe(10)
    expect(kernelBitOf(5, RESOURCE_FAMILY.crystal)).toBe(11)
  })

  it('never gives two kernel ores the same bit', () => {
    const bits = KERNEL_TIERS.flatMap((tier) =>
      CELL_FAMILIES.map((cellFamily) => kernelBitOf(tier, cellFamily)),
    )
    expect(new Set(bits).size).toBe(KERNEL_TIERS.length * CELL_FAMILIES.length)
  })

  it('tags the kernel default index, and the provider tags its own', () => {
    expect(withFreshRegistrySet(nothing, oreIndexTag)).toBe(KERNEL_ORE_INDEX_TAG)
    expect(withFreshRegistrySet(registerCopperProvider, oreIndexTag)).toBe('ores.type-id')
  })

  it("answers with the provider's bit when one is registered", () => {
    expect(withFreshRegistrySet(registerCopperProvider, () => oreBitIndexOf(copperOre))).toBe(7)
  })
})
