import { describe, expect, it } from 'vitest'
import { planetParamsFor } from '../world/planetParams'
import { oreCell, RESOURCE_FAMILY } from '../world/worldCell'
import { artDirectionProblems } from './artDirection'
import artFile from './artDirection.json'
import { lumaOf } from './colour'
import { oreLookOf, oreLookOfCell, type OreFamilyName } from './oreLook'

const FAMILIES: readonly OreFamilyName[] = ['metal', 'crystal']
const TIERS = Array.from({ length: 60 }, (_, index) => index + 1)

describe('ore look', () => {
  it.each(FAMILIES)('ranks every %s tier above the one below it in greyscale', (family) => {
    const lumas = TIERS.map((tier) => lumaOf(oreLookOf(family, tier).colour))
    lumas.slice(1).forEach((luma, index) => expect(luma).toBeGreaterThan(lumas[index]))
  })

  it.each(FAMILIES)('glows more strongly at every higher %s tier', (family) => {
    const glows = TIERS.map((tier) => oreLookOf(family, tier).glow)
    glows.slice(1).forEach((glow, index) => expect(glow).toBeGreaterThan(glows[index]))
  })

  it('never shows fewer sparkles at a higher tier', () => {
    const sparkles = TIERS.map((tier) => oreLookOf('metal', tier).sparkles)
    sparkles
      .slice(1)
      .forEach((count, index) => expect(count).toBeGreaterThanOrEqual(sparkles[index]))
  })

  it('tells the two families apart by silhouette, not colour alone', () => {
    expect(oreLookOf('metal', 3).silhouette).not.toBe(oreLookOf('crystal', 3).silhouette)
  })

  it('gives the same tier the same brightness in either family, so luma means value', () => {
    const metal = lumaOf(oreLookOf('metal', 5).colour)
    expect(lumaOf(oreLookOf('crystal', 5).colour)).toBeCloseTo(metal, 6)
  })

  it('reads the tier of a cell from the planet: planet 2 band 1 ore is tier 4', () => {
    const cell = oreCell(RESOURCE_FAMILY.crystal, 0)
    expect(oreLookOfCell(planetParamsFor(1, 2), cell)).toEqual(oreLookOf('crystal', 4))
  })

  it('keeps every slice tier inside the colour range', () => {
    const channels = TIERS.slice(0, 8).flatMap((tier) => [...oreLookOf('crystal', tier).colour])
    channels.forEach((channel) => expect(channel).toBeGreaterThanOrEqual(0))
    channels.forEach((channel) => expect(channel).toBeLessThanOrEqual(1))
  })
})

describe('art direction data', () => {
  it('accepts the committed file', () => {
    expect(artDirectionProblems(artFile)).toEqual([])
  })

  it('names every broken entry at once', () => {
    const broken = {
      ...artFile,
      palettes: { 'palette.x': { ...artFile.palettes['palette.planet_1'], sky: 'blue' } },
      oreFamilies: { ...artFile.oreFamilies, crystal: { silhouette: 'blobs', hue: '#5cc8e8' } },
      oreRamp: { ...artFile.oreRamp, halfRankTier: 0 },
    }
    expect(artDirectionProblems(broken)).toEqual([
      'palettes.palette.x.sky must be a #rrggbb colour',
      'oreFamilies.crystal.silhouette must be one of flecks, shards',
      'oreRamp.halfRankTier must be a number > 0',
    ])
  })
})
