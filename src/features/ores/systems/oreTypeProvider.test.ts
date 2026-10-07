import { describe, expect, it } from 'vitest'
import { withRegistrations } from '../../../registries/registrar'
import type { SliceDefinition } from '../../../registries/sliceDefinition'
import { minedOreOf } from '../../../systems/authority/minedOre'
import { isOreIconId } from '../../../systems/art/icons/oreIcon'
import {
  oreTypeCatalogue,
  oreTypeOf as kernelOreTypeOf,
} from '../../../systems/registries/oreTypes'
import { planetParamsFor } from '../../../systems/world/planetParams'
import { oreCell, RESOURCE_FAMILY, type ResourceFamily } from '../../../systems/world/worldCell'
import { oreFamilies, oreTypeOf } from './oreCatalogue'
import { lastCampaignOreTier, oreTypeProvider } from './oreTypeProvider'

const catalogueSlice: SliceDefinition = { id: 'ores', register: (r) => r.oreTypes(oreTypeProvider) }

const withCatalogue = <T>(run: () => T): T => withRegistrations([catalogueSlice], run)

function queryOf(familyId: string, tier: number) {
  const cellFamily = oreFamilies().findIndex((family) => family.id === familyId) + 1
  return { tier, cellFamily: cellFamily as ResourceFamily }
}

describe('ore type provider', () => {
  it("answers a cell's tier and family code with the catalogue type", () => {
    const ore = withCatalogue(() =>
      kernelOreTypeOf({ tier: 12, cellFamily: RESOURCE_FAMILY.crystal }),
    )
    expect(ore).toEqual({
      id: 'crystal_t12',
      name: 'Crystal Quartzine',
      family: 'crystal',
      cellFamily: RESOURCE_FAMILY.crystal,
      tier: 12,
      grade: 3,
      iconId: 'icon-ore-crystal-t12',
      requires: [],
    })
  })

  it('names the mined ore of the run log by the catalogue: oreId is oreTypeOf(family, tier).id', () => {
    const params = planetParamsFor(83921, 3)
    const cell = oreCell(RESOURCE_FAMILY.metal, 4)
    const mined = withCatalogue(() => minedOreOf(params, { tx: 0, ty: 0 }, cell))
    expect(mined.oreId).toBe(oreTypeOf('metal', mined.resourceTier).id)
    expect(mined.oreId).toBe('metal_t11')
  })

  it('lists every family at every campaign tier, t 1 to 124, once each', () => {
    const catalogue = withCatalogue(() => oreTypeCatalogue())
    expect(lastCampaignOreTier()).toBe(124)
    expect(catalogue).toHaveLength(12 * 124)
    expect(new Set(catalogue.map((ore) => ore.id)).size).toBe(catalogue.length)
  })

  it('gives every catalogue type a generated ore icon', () => {
    const catalogue = withCatalogue(() => oreTypeCatalogue())
    expect(catalogue.filter((ore) => !isOreIconId(ore.iconId))).toEqual([])
  })

  it('gives every ore it can answer its own codex bit, deeper ores the higher bits', () => {
    const ores = withCatalogue(() => [
      ...oreTypeCatalogue(),
      kernelOreTypeOf({ tier: 1802, cellFamily: RESOURCE_FAMILY.crystal }),
    ])
    const bits = ores.map((ore) => oreTypeProvider.bitIndexOf(ore))
    expect(new Set(bits).size).toBe(ores.length)
    expect(bits.every((bit) => Number.isSafeInteger(bit) && bit >= 0)).toBe(true)
    const bitOf = (familyId: string, tier: number) =>
      oreTypeProvider.bitIndexOf(oreTypeProvider.oreTypeOf(queryOf(familyId, tier)))
    expect(bitOf('metal', 2)).toBeGreaterThan(bitOf('exotic', 1))
  })

  it('wears the first family on a cell with no family code', () => {
    const ore = withCatalogue(() => kernelOreTypeOf({ tier: 2, cellFamily: RESOURCE_FAMILY.none }))
    expect(ore.family).toBe('metal')
  })
})
