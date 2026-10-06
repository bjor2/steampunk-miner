import { describe, expect, it } from 'vitest'
import { oreTier } from '../economy/oreEconomy'
import { ARCHETYPE_IDS } from '../registeredIds'
import { dockSiteOf } from './dockSite'
import { coreTileCount } from './planetGeometry'
import { coreRadiusFor, planetParamsFor, radiusForPlanet } from './planetParams'

describe('planet params', () => {
  it('gives planet 1 a radius of 300, planet 2 400 and planet 40 906 (#6 section 2)', () => {
    expect([1, 2, 40].map(radiusForPlanet)).toEqual([300, 400, 906])
  })

  it('keeps the radius non-decreasing and at most 1000 out to a million planets', () => {
    const planets = [1, 2, 3, 10, 40, 1000, 1_000_000]
    const radii = planets.map(radiusForPlanet)
    expect(radii).toEqual([...radii].sort((a, b) => a - b))
    expect(Math.max(...radii)).toBeLessThanOrEqual(1000)
  })

  it('caps the core radius between 4 and 10 tiles: 7 on planet 1, 10 from planet 2 on', () => {
    expect([100, 300, 400, 906].map(coreRadiusFor)).toEqual([4, 7, 10, 10])
  })

  it('counts 156 core tiles on planet 1 and 316 on planet 2 (#4 Producer note)', () => {
    expect(coreTileCount(planetParamsFor(1, 1))).toBe(156)
    expect(coreTileCount(planetParamsFor(1, 2))).toBe(316)
  })

  it('places the band starts at 8, 35, 65 and 90 percent of the depth as integer thresholds', () => {
    // R = 300: band radii 276, 195, 105 and 30 tiles, squared in half tiles.
    expect(planetParamsFor(1, 1).bandStartsHalfTileSq).toEqual([
      4 * 276 * 276,
      4 * 195 * 195,
      4 * 105 * 105,
      4 * 30 * 30,
    ])
  })

  it('gives planet 2 the heavier gravity and its own palette and family weights', () => {
    const first = planetParamsFor(5, 1)
    const second = planetParamsFor(5, 2)
    expect(second.gravityMultiplier).toBe(1.25)
    expect(first.gravityMultiplier).toBe(1)
    expect(second.paletteId).not.toBe(first.paletteId)
    expect(second.familyWeights).not.toEqual(first.familyWeights)
  })

  it('puts the starter vein on planet 1 only', () => {
    expect(planetParamsFor(5, 1).hasStarterVein).toBe(true)
    expect(planetParamsFor(5, 2).hasStarterVein).toBe(false)
  })

  it('gives planets that differ only in the high 32 bits of the index different seeds', () => {
    expect(planetParamsFor(5, 2 ** 40 + 1).planetSeed).not.toBe(planetParamsFor(5, 1).planetSeed)
  })

  it('is the same for the same world seed and planet index', () => {
    expect(planetParamsFor(83921, 2)).toEqual(planetParamsFor(83921, 2))
  })

  it.each([0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1])('refuses the planet index %s', (index) => {
    expect(() => planetParamsFor(1, index)).toThrow(RangeError)
  })

  it.each([-1, 2 ** 32, 0.5])('refuses the world seed %s', (seed) => {
    expect(() => planetParamsFor(seed, 1)).toThrow(RangeError)
  })
})

describe('planet 2', () => {
  const second = planetParamsFor(83921, 2)

  it('is the heavy archetype: radius 400, core radius 10, 316 core tiles, gravity 1.25', () => {
    expect(second).toMatchObject({
      archetypeId: 'archetype.heavy',
      radiusTiles: 400,
      coreRadiusTiles: 10,
      gravityMultiplier: 1.25,
    })
    expect(coreTileCount(second)).toBe(316)
  })

  it('carries ore tiers 4 to 8 in its five bands', () => {
    expect([1, 2, 3, 4, 5].map((band) => oreTier(2, band))).toEqual([4, 5, 6, 7, 8])
  })

  it('puts the dock site in the same place for the same seed on every run', () => {
    expect(dockSiteOf(planetParamsFor(83921, 2))).toEqual(dockSiteOf(second))
    expect(dockSiteOf(second).dockPoint.ty).toBeGreaterThan(390)
  })

  it('registers the base, heavy and heat archetype ids for the scenario validator', () => {
    expect(planetParamsFor(83921, 1).archetypeId).toBe('archetype.base')
    expect(ARCHETYPE_IDS).toEqual(['archetype.base', 'archetype.heavy', 'archetype.heat'])
  })

  it('gives the Fire act, planets 8 to 16, the heat archetype and its palette (#113)', () => {
    const archetypeIds = [7, 8, 16, 17].map((planet) => planetParamsFor(83921, planet).archetypeId)
    expect(archetypeIds).toEqual([
      'archetype.heavy',
      'archetype.heat',
      'archetype.heat',
      'archetype.heavy',
    ])
    const heat = planetParamsFor(83921, 8)
    const heavy = planetParamsFor(83921, 7)
    expect(heat.paletteId).toBe('palette.heat')
    expect([heat.gravityMultiplier, heat.familyWeights]).toEqual([
      heavy.gravityMultiplier,
      heavy.familyWeights,
    ])
  })
})
