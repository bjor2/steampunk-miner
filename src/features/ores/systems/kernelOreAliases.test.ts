import { describe, expect, it } from 'vitest'
import { withRegistrations } from '../../../registries/registrar'
import type { SliceDefinition } from '../../../registries/sliceDefinition'
import { canonicalDiscoveryKey } from '../../../systems/registries/discovery'
import { oreTypeCatalogue } from '../../../systems/registries/oreTypes'
import { kernelOreAliases } from './kernelOreAliases'
import { oreTypeProvider } from './oreTypeProvider'

const aliasSlice: SliceDefinition = {
  id: 'ores',
  register(r) {
    r.oreTypes(oreTypeProvider)
    r.discoveryAliases(kernelOreAliases())
  },
}

describe('kernel ore aliases', () => {
  it('canonicalises a kernel ore id onto the catalogue type of its family and tier', () => {
    const keys = withRegistrations([aliasSlice], () => [
      canonicalDiscoveryKey('ore:kernel.metal.t3'),
      canonicalDiscoveryKey('ore:kernel.crystal.t124'),
      canonicalDiscoveryKey('ore:metal_t3'),
    ])
    expect(keys).toEqual(['ore:metal_t3', 'ore:crystal_t124', 'ore:metal_t3'])
  })

  it('maps every campaign tier of both kernel families onto a type the catalogue lists', () => {
    const { aliases } = kernelOreAliases()
    const listed = new Set<string>(
      withRegistrations([aliasSlice], () => oreTypeCatalogue()).map(keyOf),
    )
    const targets = Object.values(aliases)
    expect(targets).toHaveLength(2 * 124)
    expect(targets.filter((key) => key === undefined || !listed.has(key))).toEqual([])
  })
})

function keyOf({ id }: { id: string }): string {
  return `ore:${id}`
}
