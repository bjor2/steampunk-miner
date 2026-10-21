import { describe, expect, it } from 'vitest'
import { withRegistrations } from '../../../registries/registrar'
import type { SliceDefinition } from '../../../registries/sliceDefinition'
import { planetLookOf } from '../../../systems/registries/planetLooks'
import { planetSkyBandOf } from '../../../systems/registries/planetSkyBand'
import { bandColourOf, paletteOf, shownPaletteOf } from '../../../systems/render/bandPalette'
import { lumaOf, rgbOfHex } from '../../../systems/render/colour'
import { freshPlanetParamsFor, type PlanetParams } from '../../../systems/world/planetParams'
import economyFile from '../ores.economy.json'
import { PLANET_LOOK_PROVIDER } from './planetLookProvider'
import { areColoursApart, brightestArchetypeRockLuma, planetLookProblems } from './planetLooks'
import { PLANET_RADIUS_PROVIDER } from './planetRadiusProvider'

// Per-planet looks for P2 to P5 (ticket 653, spec #647): each planet's rock tint, horizon and sky
// band on its own registry row, pairwise different, the ore hue guards kept and P1 drawn as before.

type Row = Record<string, unknown>

const SHIPPED_ROWS: readonly Row[] = economyFile.ore.planets.rows
const LOOK_PLANETS = [2, 3, 4, 5]
const WORLD_SEED = 83921
const BANDS = [1, 2, 3, 4, 5]

const paramsOf = (planet: number): PlanetParams => freshPlanetParamsFor(WORLD_SEED, planet)

/** The shipped rows with planet `planet`'s look changed (`null` removes it). */
function rowsWithLook(planet: number, change: Row | null): Row[] {
  return SHIPPED_ROWS.map((row) => {
    if (row.planet !== planet) return row
    if (change === null) {
      const { look: _removed, ...rest } = row
      return rest
    }
    return { ...row, look: { ...((row.look ?? {}) as Row), ...change } }
  })
}

function rowsWithBand(planet: number, change: Row): Row[] {
  const band = (SHIPPED_ROWS[planet - 1].look as Row).skyBand as Row
  return rowsWithLook(planet, { skyBand: { ...band, ...change } })
}

/** The ores slice's radius provider alone, or with its look provider beside it. */
function oresRowsSlice(withLook: boolean): SliceDefinition {
  return {
    id: 'ores',
    register(r) {
      r.planetRadius(PLANET_RADIUS_PROVIDER)
      if (withLook) r.planetLook(PLANET_LOOK_PROVIDER)
    },
  }
}

describe('per-planet looks (ticket 653)', () => {
  it('gives each of planets 2 to 5 a look and planet 1 and planets past 5 none', () => {
    for (const planet of LOOK_PLANETS) expect(planetLookOf(planet)).not.toBeNull()
    for (const planet of [1, 6, 7, 10, 11]) expect(planetLookOf(planet)).toBeNull()
  })

  it('draws planet 1 exactly as before, in its archetype palette and with no sky band', () => {
    const planet1 = paramsOf(1)
    expect(shownPaletteOf(planet1)).toEqual(paletteOf('palette.planet_1'))
    expect(planetSkyBandOf(planet1)).toBeNull()
  })

  it('draws planets 2 to 5 in their row’s rock, horizon and sky band', () => {
    for (const planet of LOOK_PLANETS) {
      const look = planetLookOf(planet)!
      const shown = shownPaletteOf(paramsOf(planet))
      expect(shown.surface).toEqual(rgbOfHex(look.rockSurface))
      expect(shown.deep).toEqual(rgbOfHex(look.rockDeep))
      expect(shown.sky).toEqual(rgbOfHex(look.horizon))
      expect(planetSkyBandOf(paramsOf(planet))).toEqual(look.skyBand)
    }
  })

  it('makes planets 1 to 5 differ pairwise in rock and horizon, and 2 to 5 in sky band', () => {
    const planets = [1, ...LOOK_PLANETS]
    for (const [at, first] of planets.entries()) {
      for (const second of planets.slice(at + 1)) {
        const [one, two] = [shownPaletteOf(paramsOf(first)), shownPaletteOf(paramsOf(second))]
        expect(areColoursApart(one.surface, two.surface)).toBe(true)
        expect(areColoursApart(one.sky, two.sky)).toBe(true)
      }
    }
    const bands = LOOK_PLANETS.map((planet) => rgbOfHex(planetLookOf(planet)!.skyBand.colour))
    for (const [at, band] of bands.entries()) {
      for (const other of bands.slice(at + 1)) {
        expect(areColoursApart(band, other)).toBe(true)
      }
    }
  })

  it('keeps every look’s rock at or under the brightest host rock, so every hue slot reads as ore', () => {
    const ceiling = brightestArchetypeRockLuma()
    expect(ceiling).toBeGreaterThan(0.43)
    expect(ceiling).toBeLessThan(0.45)
    for (const planet of LOOK_PLANETS) {
      for (const band of BANDS) {
        expect(lumaOf(bandColourOf(shownPaletteOf(paramsOf(planet)), band))).toBeLessThanOrEqual(
          ceiling,
        )
      }
    }
  })

  it('leaves every planet’s params as they were, so existing worlds keep their stamp and load', () => {
    for (const planet of [1, ...LOOK_PLANETS]) {
      const without = withRegistrations([oresRowsSlice(false)], () => paramsOf(planet))
      const looked = withRegistrations([oresRowsSlice(true)], () => paramsOf(planet))
      expect(looked).toEqual(without)
    }
  })

  it('accepts the shipped looks', () => {
    expect(planetLookProblems(SHIPPED_ROWS)).toEqual([])
  })

  it('refuses a look on planet 1 and a missing one on planets 2 to 5', () => {
    const onPlanet1 = rowsWithLook(1, SHIPPED_ROWS[1].look as Row)
    expect(planetLookProblems(onPlanet1)).toEqual([
      'ore.planets.rows[0].look: planet 1 stays as it is and holds no look',
    ])
    expect(planetLookProblems(rowsWithLook(4, null))).toEqual([
      'ore.planets.rows[3].look is missing: planets 2 to 5 each hold one',
    ])
  })

  it('refuses a colour that is not #rrggbb and a rock brighter than the host rock', () => {
    expect(planetLookProblems(rowsWithLook(3, { horizon: 'green' }))).toEqual([
      'ore.planets.rows[2].look.horizon must be a #rrggbb colour',
    ])
    const [problem] = planetLookProblems(rowsWithLook(3, { rockSurface: '#c8c8c8' }))
    expect(problem).toMatch(/^ore\.planets\.rows\[2\]\.look\.rockSurface is brighter than/)
  })

  it('refuses a sky band out of its bounds or with a stray field', () => {
    expect(planetLookProblems(rowsWithBand(2, { heightM: -1 }))).toEqual([
      'ore.planets.rows[1].look.skyBand.heightM must be metres from 0 to 10',
    ])
    expect(planetLookProblems(rowsWithBand(2, { thicknessM: 0 }))).toEqual([
      'ore.planets.rows[1].look.skyBand.thicknessM must be metres from 0.25 to 10',
    ])
    expect(planetLookProblems(rowsWithBand(2, { flicker: 2 }))).toEqual([
      'ore.planets.rows[1].look.skyBand.flicker must be from 0 to 1',
    ])
    expect(planetLookProblems(rowsWithBand(2, { ribbon: 'aurora' }))).toEqual([
      'ore.planets.rows[1].look.skyBand.ribbon is not a band field',
    ])
  })

  it('refuses a field no look row holds', () => {
    expect(planetLookProblems(rowsWithLook(5, { oreTint: '#ffffff' }))).toEqual([
      'ore.planets.rows[4].look.oreTint is not a look field',
    ])
  })

  it('refuses two planets that share a look', () => {
    const planet2 = SHIPPED_ROWS[1].look as Row
    const problems = planetLookProblems(rowsWithLook(4, { ...planet2 }))
    expect(problems).toEqual([
      'ore.planets.rows: planets 2 and 4 share a look: their rockSurface lie under 32 apart',
      'ore.planets.rows: planets 2 and 4 share a look: their horizon lie under 32 apart',
      'ore.planets.rows: planets 2 and 4 share a look: their skyBand.colour lie under 32 apart',
    ])
  })
})
