import { describe, expect, it } from 'vitest'
import { PLANET_NAME_CHARACTERS_MAX } from '../../constants/uiParts'
import { fnv1a64Hex } from '../../systems/authority/stateDigest'
import { planetDisplayNameOf, planetLookOf, planetRowOf } from '../../systems/registries/planetRow'
import { surfaceLayerOf } from '../../systems/world/surfaceLayer'
import {
  freshPlanetParamsFor,
  planetParamsFor,
  radiusForPlanet,
  type PlanetParams,
} from '../../systems/world/planetParams'

// The planet-row registry (GD lock on #707, 6326252575): P1 to P10 keep their names, looks and
// radii byte-identical under the current ore rules and under rules 6, the last before the
// registry radius (ticket 643), and a planet far past the rows still resolves.

const SEED = 20261021
const PLANETS_1_TO_10 = Array.from({ length: 10 }, (_, at) => at + 1)
/** The ore rules of P2's own species pool (ticket 632), the last before the registry radius. */
const LADDER_ORE_RULES = 6
const FAR_PLANETS = [1, 40, 41, 1000, 1_000_000]

const GOLDEN = {
  currentRows: '778b863a379eedc2',
  ladderRows: '64311e1adaba9536',
}

/** Each planet's name, look and generator params under `paramsOf`, as one digest. */
function digestOfRows(paramsOf: (planet: number) => unknown): string {
  const rows = PLANETS_1_TO_10.map((planet) => ({
    planet,
    name: planetDisplayNameOf(planet),
    look: planetLookOf(planet),
    params: paramsOf(planet),
  }))
  return fnv1a64Hex(JSON.stringify(rows))
}

/** Whether the pinned cells and the ramp end inside band 1; a planet with no layer has none. */
function isRampInsideBandOne(params: PlanetParams): boolean {
  const layer = surfaceLayerOf(params)
  return layer === null || layer.pinnedCells + layer.rampCells <= layer.bandOneCells
}

describe('planet row golden', () => {
  it('keeps planets 1 to 10 byte-identical under the current ore rules', () => {
    const radii = PLANETS_1_TO_10.map((planet) => freshPlanetParamsFor(SEED, planet).radiusTiles)
    expect(radii).toEqual([300, 421, 492, 543, 582, 614, 641, 664, 685, 703])
    expect(digestOfRows((planet) => freshPlanetParamsFor(SEED, planet))).toBe(GOLDEN.currentRows)
  })

  it("keeps planets 1 to 10 byte-identical on #6's ladder under ore rules 6", () => {
    const ladder = (planet: number) => planetParamsFor(SEED, planet, LADDER_ORE_RULES)
    const radii = PLANETS_1_TO_10.map((planet) => ladder(planet).radiusTiles)
    expect(radii).toEqual(PLANETS_1_TO_10.map(radiusForPlanet))
    expect(digestOfRows(ladder)).toBe(GOLDEN.ladderRows)
  })

  it("lays each row's pool and frozen radius on the kernel's row, and past the rows a name alone", () => {
    expect(planetRowOf(2)).toMatchObject({ displayName: 'Gravelholm', poolId: 'foothold-p2' })
    expect(PLANETS_1_TO_10.map((planet) => planetRowOf(planet).radius?.tiles)).toEqual([
      300, 421, 492, 543, 582, 614, 641, 664, 685, 703,
    ])
    expect(planetRowOf(11)).toMatchObject({ displayName: 'Copperholt', poolId: null, radius: null })
  })

  it.each(FAR_PLANETS)(
    'resolves planet %i with a name, a radius and a ramp inside band 1',
    (planet) => {
      expect(planetRowOf(planet)).toMatchObject({ planetIndex: planet, solarSystem: 1 })
      const name = planetDisplayNameOf(planet)
      expect(name.length).toBeGreaterThan(0)
      expect(name.length).toBeLessThanOrEqual(PLANET_NAME_CHARACTERS_MAX)
      const params = freshPlanetParamsFor(SEED, planet)
      expect(params.radiusTiles).toBeGreaterThanOrEqual(planet > 10 ? 703 : 300)
      expect(isRampInsideBandOne(params)).toBe(true)
    },
  )
})
