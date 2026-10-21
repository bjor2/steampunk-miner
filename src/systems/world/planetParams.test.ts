import { describe, expect, it } from 'vitest'
import { ECONOMY } from '../economy/economy'
import { oreTier } from '../economy/oreEconomy'
import { ARCHETYPE_IDS } from '../registeredIds'
import { dockSiteOf } from './dockSite'
import { coreTileCount } from './planetGeometry'
import { fnv1a64Hex } from '../authority/stateDigest'
import {
  coreRadiusFor,
  DEPTH_CURVE_ORE_RULES,
  freshPlanetParamsFor,
  isDepthCurvePlanet,
  ORE_RULES_FROM_PLANET,
  ORE_RULES_VERSION,
  planetParamsFor,
  radiusForPlanet,
} from './planetParams'
import {
  DEPTH_CURVE_PATCH_SEED_CHANCE_BP,
  ORE_DENSITY_BP,
  PATCH_SEED_CHANCE_BP,
} from './planetTable'

/** Taken on main at b2e77198, before the ore rules existed. */
const LEGACY_PARAMS_DIGEST = '52478ece7bf1087f'
const PLANETS_1_TO_200 = Array.from({ length: 200 }, (_, at) => at + 1)

/** The params JSON of planets 1 to 200 as main wrote it before ticket 445, as one digest. */
function legacyParamsDigestOf(paramsOf: (planetIndex: number) => unknown): string {
  return fnv1a64Hex(PLANETS_1_TO_200.map((index) => JSON.stringify(paramsOf(index))).join('\n'))
}

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

describe('planet params ore rules (ticket 445)', () => {
  it('keeps the params JSON of every unstamped planet, 1 to 200, byte-identical to before', () => {
    expect(legacyParamsDigestOf((index) => planetParamsFor(83921, index))).toBe(
      LEGACY_PARAMS_DIGEST,
    )
  })

  it('differs from the legacy params only by the stamp, appended last, under rules 2', () => {
    const legacy = planetParamsFor(83921, 7)
    const stamped = planetParamsFor(83921, 7, 2)
    expect(stamped).toEqual({ ...legacy, oreRulesVersion: 2 })
    expect(Object.keys(stamped).at(-1)).toBe('oreRulesVersion')
  })

  it('stamps fresh planet 1 with ore rules 2 and planet 2 on with rules 6 (446, 448, #453, 625, 632)', () => {
    const stamps = [1, 2, 3, 4, 60].map((index) => freshPlanetParamsFor(1, index).oreRulesVersion)
    expect(ORE_RULES_FROM_PLANET).toBe(1)
    expect(ORE_RULES_VERSION).toBe(6)
    expect(stamps).toEqual([2, 6, 6, 6, 6])
  })

  it('still reads a planet stamped with ore rules 1 (ticket 445)', () => {
    expect(planetParamsFor(1, 3, 1).oreRulesVersion).toBe(1)
  })

  it('refuses ore rules this build does not know', () => {
    expect(() => planetParamsFor(1, 3, ORE_RULES_VERSION + 1)).toThrow(RangeError)
    expect(() => planetParamsFor(1, 3, 0)).toThrow(RangeError)
  })
})

describe('planet params under the depth density curve (ticket 448)', () => {
  it("gives a planet from 3 under ore rules 3 the curve's band means on the step-band lattice", () => {
    const params = planetParamsFor(83921, 3, DEPTH_CURVE_ORE_RULES)
    expect(params.oreDensityBp).toEqual(ECONOMY.planets.depthDensity.bandMeanBp)
    expect(params.patchSeedChanceBp).toEqual(DEPTH_CURVE_PATCH_SEED_CHANCE_BP)
    expect(params.patchLatticeDensityBp).toEqual(ORE_DENSITY_BP)
    expect(isDepthCurvePlanet(60, ORE_RULES_VERSION)).toBe(true)
  })

  it('keeps the step bands on planets 1 and 2 and on a planet a save holds under rules 2', () => {
    const stepBands = [
      planetParamsFor(83921, 1, ORE_RULES_VERSION),
      planetParamsFor(83921, 2, ORE_RULES_VERSION),
      planetParamsFor(83921, 3, 2),
      planetParamsFor(83921, 3),
    ]
    for (const params of stepBands) {
      expect(params.oreDensityBp).toEqual(ORE_DENSITY_BP)
      expect(params.patchSeedChanceBp).toEqual(PATCH_SEED_CHANCE_BP)
      expect('patchLatticeDensityBp' in params).toBe(false)
    }
  })
})
