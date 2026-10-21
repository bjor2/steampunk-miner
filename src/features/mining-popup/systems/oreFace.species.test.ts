import { describe, expect, it } from 'vitest'
import { oreTier } from '../../../systems/economy/oreEconomy'
import { ORE_GRADE_NAMES } from '../../../systems/render/oreGrade'
import { freshPlanetParamsFor, type PlanetParams } from '../../../systems/world/planetParams'
import { MATERIALS, type Material } from '../../materials'
import { oreFamilies, oreTypeOf } from '../../ores'
import { planetRosterOf, planetSpeciesOf } from '../../roster'
import { oreFaceOf } from './oreFace'

// Ticket 695: a unit is shown by its species' own name, never `<grade> <family>`. Every name the
// popup can show on P1 to P5 (each species the planet's roster binds, and the ore type's name a
// unit naming no cell falls back to) is told apart from every other on that planet.

const SEED = 83921
const PLANETS = [1, 2, 3, 4, 5]
const BAND_ONE = 1
const FAMILY_NAMES = oreFamilies().map((family) => family.name)
const [IRONSTONE] = MATERIALS.materials.filter((material) => material.id === 'ironstone-brassvein')

function oreIdOf(params: PlanetParams, family: string): string {
  return oreTypeOf(family, oreTier(params.planetIndex, BAND_ONE)).id
}

function rosterSpeciesOf(params: PlanetParams): (Material | null)[] {
  return planetRosterOf(params).map((_, at) => planetSpeciesOf(params, at + 1))
}

/** Every name the popup can show on the planet: its species, then its families' type names. */
function shownNamesOf(params: PlanetParams): string[] {
  const species = rosterSpeciesOf(params).filter((found) => found !== null)
  const families = [...new Set(species.map((found) => found.family))]
  return [
    ...species.map((found) => oreFaceOf(oreIdOf(params, found.family), params, found)!.name),
    ...families.map((family) => oreFaceOf(oreIdOf(params, family), params)!.name),
  ]
}

describe('ore face species name', () => {
  it('names a unit by its species alone, with no family after it', () => {
    const params = freshPlanetParamsFor(SEED, 1)
    const face = oreFaceOf('metal_t1', params, IRONSTONE)
    expect(face).toMatchObject({ speciesId: 'ironstone-brassvein', name: 'Ironstone' })
  })

  it('names a unit that names no species by its ore type, never with a grade', () => {
    const face = oreFaceOf('metal_t1', freshPlanetParamsFor(SEED, 1))
    expect(face).toMatchObject({ speciesId: null, name: 'Brassvein' })
  })

  it('binds a species to every kind slot of P1 to P5', () => {
    for (const planet of PLANETS) {
      const species = rosterSpeciesOf(freshPlanetParamsFor(SEED, planet))
      expect(species.length, `P${planet}`).toBeGreaterThan(0)
      expect(
        species.filter((found) => found === null),
        `P${planet}`,
      ).toEqual([])
    }
  })

  it('shows every name once on its planet, P1 to P5', () => {
    for (const planet of PLANETS) {
      const names = shownNamesOf(freshPlanetParamsFor(SEED, planet)).map((name) =>
        name.toLowerCase(),
      )
      const repeated = names.filter((name, at) => names.indexOf(name) !== at)
      expect(repeated, `P${planet}`).toEqual([])
    }
  })

  it('never builds a shown name from a grade and a family, P1 to P5', () => {
    for (const planet of PLANETS) {
      for (const name of shownNamesOf(freshPlanetParamsFor(SEED, planet))) {
        const words = name.split(' ')
        expect(ORE_GRADE_NAMES as readonly string[], `P${planet} ${name}`).not.toContain(words[0])
        if (words.length > 1) expect(FAMILY_NAMES, `P${planet} ${name}`).not.toContain(words.at(-1))
      }
    }
  })
})
