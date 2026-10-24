import { describe, expect, it } from 'vitest'
import { PACING_WORLD_SEEDS } from '../../../constants/pacingSeeds'
import { MATERIALS } from '../../materials'
import { systemMaterialPoolsOf, type MaterialPool } from './materialPool'
import { planetRecolourProblemsOf, systemRecolourProblemsOf } from './planetRecolour'
import { systemRosterOf, type RosterPlanet } from './systemRoster'

// The HS fail-on-recolour test of the Campaign Scaling lock (point 5 on ticket 779): it fails if
// any planet of solar system 2 only recolours the first system's content. Each planet must bring a
// new enemy, hazard or ore family (new by id, name and behaviour), and no kind of its pool may be a
// first-system species under a new hue.

const ROSTER_SEED = 20261024
const SEEDS = [ROSTER_SEED, ...PACING_WORLD_SEEDS['bot-slice']]

function firstPlanetOf(worldSeed: number): { planet: RosterPlanet; pool: MaterialPool } {
  return {
    planet: systemRosterOf(worldSeed, 2n)[0],
    pool: systemMaterialPoolsOf(worldSeed, 2n)[0],
  }
}

/** The pool with each kind dressed as a planet 6-7 species, its hue slot kept: a recolour. */
function recolouredPool(pool: MaterialPool): MaterialPool {
  const species = MATERIALS.materials.filter((row) => row.pool === 'foothold-p6-p7')
  return {
    ...pool,
    kinds: pool.kinds.map((kind, at) => {
      const source = species[at % species.length]
      return { ...kind, silhouette: source.silhouette, pattern: source.pattern }
    }),
  }
}

describe('planet recolour check: solar system 2 (ticket 779)', () => {
  it('finds every planet of system 2 bringing something new, under the roster and pacing seeds', () => {
    SEEDS.forEach((seed) => expect(systemRecolourProblemsOf(seed, 2n)).toEqual([]))
  })

  it('fails on a planet that brings no new family', () => {
    const { planet, pool } = firstPlanetOf(ROSTER_SEED)
    expect(planetRecolourProblemsOf({ ...planet, slot: null }, pool)).toEqual([
      '2·1 brings no new enemy, hazard or ore family',
    ])
  })

  it("fails on a planet whose family is the first system's by name or by behaviour", () => {
    const { planet, pool } = firstPlanetOf(ROSTER_SEED)
    const family = planet.slot!
    const renamed = { ...planet, slot: { ...family, name: 'Voidglass' } }
    const shover = {
      ...planet,
      slot: { ...family, behaviour: { ...family.behaviour, effect: 'shove' as const } },
    }
    expect(planetRecolourProblemsOf(renamed, pool)).toEqual([
      `2·1's family "Voidglass" is a first-system word`,
    ])
    expect(planetRecolourProblemsOf(shover, pool)).toEqual([
      `${family.id} recolours steamvent: both shove`,
    ])
  })

  it("fails on a planet whose pool is the first system's species under new hues", () => {
    const { planet, pool } = firstPlanetOf(ROSTER_SEED)
    const problems = planetRecolourProblemsOf(planet, recolouredPool(pool))
    expect(problems).toHaveLength(pool.kinds.length)
    expect(problems[0]).toMatch(/^system2-p1-c1 wears .*, a first-system species' look$/)
  })
})
