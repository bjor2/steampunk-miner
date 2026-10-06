import { describe, expect, it } from 'vitest'
import { withRegistrations } from '../../../../registries/registrar'
import type { SliceDefinition } from '../../../../registries/sliceDefinition'
import { lumaOf } from '../../../../systems/render/colour'
import { planetParamsFor } from '../../../../systems/world/planetParams'
import { oreCell, RESOURCE_FAMILY } from '../../../../systems/world/worldCell'
import { ORE_LOOKS } from '../oreFamilyLooks'
import { oreBodyColourOf, oreHueOf, rgbOfHsl } from './oreColour'
import { oreLookOfCell, oreLookOfType, oreVariantOf } from './oreLookProvider'

const TIERS = Array.from({ length: 124 }, (_, at) => at + 1)

/** A stand-in ores catalogue: every cell is radioactive at grade 4, whatever its tier. */
const radioactiveCatalogue: SliceDefinition = {
  id: 'ores',
  register: (r) =>
    r.oreTypes({
      id: 'ores.catalogue',
      oreTypeOf: ({ tier, cellFamily }) => ({
        id: `ores.radioactive_t${tier}`,
        name: 'Lumen Radioactive',
        family: 'radioactive',
        cellFamily,
        tier,
        grade: 4,
        iconId: 'none',
        requires: [],
      }),
      catalogue: () => [],
    }),
}

describe('ore look provider', () => {
  it.each(ORE_LOOKS.families.map((family) => family.id))(
    'ranks every %s tier above the one below it in greyscale, inside the family luma band',
    (familyId) => {
      const lumas = TIERS.map((tier) => lumaOf(oreLookOfType(familyId, tier).colour))
      lumas.slice(1).forEach((luma, at) => expect(luma).toBeGreaterThan(lumas[at]))
      const [low, high] = ORE_LOOKS.families.find((f) => f.id === familyId)!.lumaBand
      expect(lumas[0]).toBeGreaterThanOrEqual(low - 1e-6)
      expect(lumas[lumas.length - 1]).toBeLessThanOrEqual(high + 1e-6)
    },
  )

  it('gives G1 and G2 no glow and no sparkle, and every grade above them both', () => {
    expect(oreLookOfType('metal', 3)).toMatchObject({ glow: 0, sparkles: 0 })
    expect(oreLookOfType('metal', 11)).toMatchObject({ glow: 0, sparkles: 0 })
    expect(oreLookOfType('metal', 12).glow).toBeGreaterThan(0)
    expect(oreLookOfType('metal', 12).sparkles).toBeGreaterThan(0)
    expect(oreLookOfType('metal', 70).glow).toBeGreaterThan(oreLookOfType('metal', 30).glow)
  })

  it('draws crystal with the shards decal and metal with flecks, so families read without colour', () => {
    expect(oreLookOfType('crystal', 5).silhouette).toBe('shards')
    expect(oreLookOfType('metal', 5).silhouette).toBe('flecks')
  })

  it('reads the tier of a cell from the planet: planet 2 band 1 ore is tier 4', () => {
    const look = oreLookOfCell(planetParamsFor(1, 2), oreCell(RESOURCE_FAMILY.crystal, 0))
    expect(look).toEqual(oreLookOfType('crystal', 4))
  })

  it('takes family and grade from the ores index once a catalogue is registered', () => {
    const cell = oreCell(RESOURCE_FAMILY.metal, 0)
    const look = withRegistrations([radioactiveCatalogue], () =>
      oreLookOfCell(planetParamsFor(1, 1), cell),
    )
    expect(look).toEqual(oreLookOfType('radioactive', 1, 4))
    expect(look.glow).toBeGreaterThan(0)
  })

  it('wears the first row for a family with no row, so every cell has a look', () => {
    expect(oreLookOfType('brass', 7)).toEqual(oreLookOfType(ORE_LOOKS.families[0].id, 7))
  })

  it('never gives two neighbouring tiers of one family the same variant (#140)', () => {
    const crystal = ORE_LOOKS.families.find((family) => family.id === 'crystal')!
    TIERS.slice(1).forEach((tier) =>
      expect(oreVariantOf(crystal, tier)).not.toBe(oreVariantOf(crystal, tier - 1)),
    )
    expect(oreVariantOf(crystal, 5)).toBe(0)
  })

  it('spreads the variants across the hue band without touching its edges', () => {
    const crystal = ORE_LOOKS.families.find((family) => family.id === 'crystal')!
    const hues = [0, 1, 2, 3].map((variant) => oreHueOf(crystal, variant))
    expect(hues).toEqual([181.5, 184.5, 187.5, 190.5])
    hues.forEach((hue) => expect(hue).toBeGreaterThan(crystal.hueBand[0]))
    hues.forEach((hue) => expect(hue).toBeLessThan(crystal.hueBand[1]))
  })

  it('keeps every colour channel inside 0..1 for every family and tier', () => {
    for (const family of ORE_LOOKS.families) {
      for (const tier of TIERS) {
        oreBodyColourOf(family, oreVariantOf(family, tier), tier).forEach((channel) => {
          expect(channel).toBeGreaterThanOrEqual(0)
          expect(channel).toBeLessThanOrEqual(1)
        })
      }
    }
  })

  it('converts the six HSL sectors to sRGB', () => {
    expect(rgbOfHsl(0, 1, 0.5)).toEqual([1, 0, 0])
    expect(rgbOfHsl(120, 1, 0.5)).toEqual([0, 1, 0])
    expect(rgbOfHsl(240, 1, 0.5)).toEqual([0, 0, 1])
    expect(rgbOfHsl(60, 0, 0.5)).toEqual([0.5, 0.5, 0.5])
  })
})
