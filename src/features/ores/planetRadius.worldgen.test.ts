import { describe, expect, it } from 'vitest'
import {
  bandStartsFor,
  coreRadiusFor,
  freshPlanetParamsFor,
  planetParamsFor,
  radiusForPlanet,
} from '../../systems/world/planetParams'
import { ORE_ROWS } from './systems/oreRows'

// GD lock R2 on #302 (6306854642, ticket 643): world generation reads each planet's radius from
// its planet registry row, so its core and band boundaries scale with it; a save keeps its ladder.

const SEED = 20261021
const LAST_ROW = ORE_ROWS.planets.rows.length
const PLANETS_1_TO_200 = Array.from({ length: 200 }, (_, at) => at + 1)

describe('planet radius in world generation', () => {
  it.each(ORE_ROWS.planets.rows.map((row) => [row.planetIndex, row.radiusTiles]))(
    'generates a fresh planet %i at its row radius %i, its core and band starts from it',
    (planetIndex, radiusTiles) => {
      const params = freshPlanetParamsFor(SEED, planetIndex)
      expect(params.radiusTiles).toBe(radiusTiles)
      expect(params.coreRadiusTiles).toBe(coreRadiusFor(radiusTiles))
      expect(params.bandStartsHalfTileSq).toEqual(bandStartsFor(radiusTiles))
    },
  )

  it("keeps #6's ladder past the last row, no smaller than the last row's radius", () => {
    const pastLast = freshPlanetParamsFor(SEED, LAST_ROW + 1).radiusTiles
    expect(pastLast).toBe(radiusForPlanet(LAST_ROW + 1))
    expect(pastLast).toBeGreaterThanOrEqual(ORE_ROWS.planets.rows[LAST_ROW - 1].radiusTiles)
  })

  it('never shrinks a fresh planet from the one before, planets 1 to 200', () => {
    const radii = PLANETS_1_TO_200.map((planet) => freshPlanetParamsFor(SEED, planet).radiusTiles)
    const shrinks = radii.filter((radius, at) => at > 0 && radius < radii[at - 1])
    expect(shrinks).toEqual([])
  })

  it('keeps the ladder radius on a planet a save holds under ore rules 6', () => {
    for (const row of ORE_ROWS.planets.rows) {
      expect(planetParamsFor(SEED, row.planetIndex, 6).radiusTiles).toBe(
        radiusForPlanet(row.planetIndex),
      )
    }
  })
})
