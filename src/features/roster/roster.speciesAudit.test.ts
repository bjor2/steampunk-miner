import { describe, expect, it } from 'vitest'
import { freshPlanetParamsFor, type PlanetParams } from '../../systems/world/planetParams'
import { speciesNameOf, type Material } from '../materials'
import { planetSkinProblems } from '../mineral-skins'
import { planetRosterOf } from './systems/planetRoster'
import { planetSpeciesOf } from './systems/planetSpecies'

// Ticket 711 (spec #647): the species audit of the first five planets. Each fresh planet draws at
// least 15 species, every one with a name of its own under the #699 rule (no two on the planet share
// a name or a stem, the stem being the whole first word split at hyphens: GD ruling on #699, reading
// C) and a sprite of its own (silhouette + pattern, the #699 sprite key), and no two of its skins
// alike. P1 is held at 12 until ticket 713 moves it to its v14 pool (Producer on #711; that ticket
// switches this floor to 15).

/** Two of the roster's named seeds; a planet's roster and pool never read the seed. */
const SEEDS = [83921, 4294967295]
const SPECIES_FLOOR = 15
/** P1's legacy pool keeps its 12 species until ticket 713 (Bjor's OK) adds Pyrite Sun and its two. */
const PLANET_1_SPECIES_FLOOR = 12
const AUDITED_PLANETS: readonly [planetIndex: number, floor: number][] = [
  [1, PLANET_1_SPECIES_FLOOR],
  [2, SPECIES_FLOOR],
  [3, SPECIES_FLOOR],
  [4, SPECIES_FLOOR],
  [5, SPECIES_FLOOR],
]

function speciesOfPlanet(params: PlanetParams): Material[] {
  return planetRosterOf(params)
    .map((_, index) => planetSpeciesOf(params, index + 1))
    .filter((species): species is Material => species !== null)
}

function repeatsOf(keys: readonly string[]): string[] {
  return keys.filter((key, index) => keys.indexOf(key) !== index)
}

function nameKeyOf(species: Material): string {
  return speciesNameOf(species.epithet).toLowerCase()
}

function stemKeyOf(species: Material): string {
  return nameKeyOf(species).split(/[\s-]/)[0]
}

function spriteKeyOf(species: Material): string {
  return `${species.silhouette}|${species.pattern}`
}

describe('species audit of planets 1 to 5', () => {
  describe.each(SEEDS)('on seed %i', (seed) => {
    it.each(AUDITED_PLANETS)('draws at least its floor of species on planet %i', (index, floor) => {
      const species = speciesOfPlanet(freshPlanetParamsFor(seed, index))
      expect(new Set(species.map((row) => row.id)).size).toBeGreaterThanOrEqual(floor)
    })

    it.each(AUDITED_PLANETS)('gives every species of planet %i its own name', (index) => {
      const species = speciesOfPlanet(freshPlanetParamsFor(seed, index))
      expect(repeatsOf(species.map(nameKeyOf))).toEqual([])
    })

    it.each(AUDITED_PLANETS)('gives every species of planet %i its own stem', (index) => {
      const species = speciesOfPlanet(freshPlanetParamsFor(seed, index))
      expect(repeatsOf(species.map(stemKeyOf))).toEqual([])
    })

    it.each(AUDITED_PLANETS)('gives every species of planet %i its own sprite', (index) => {
      const species = speciesOfPlanet(freshPlanetParamsFor(seed, index))
      expect(repeatsOf(species.map(spriteKeyOf))).toEqual([])
    })

    it.each(AUDITED_PLANETS)('dresses no two species of planet %i in one skin', (index) => {
      expect(planetSkinProblems(freshPlanetParamsFor(seed, index))).toEqual([])
    })
  })
})
