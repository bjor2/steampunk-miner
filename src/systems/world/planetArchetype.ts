/**
 * A planet's archetype (#10): the heat archetype on a heat planet of the Fire act (#113), else the
 * slice's list by index, its last entry for every planet past it. Planet params take their
 * gravity, palette and ore families from it (`planetParams.ts`), and the planet row shows its
 * gravity as a trait (#724, `registries/planetRow.ts`).
 */
import { isHeatPlanet } from '../economy/heatEconomy'
import { HEAT_PLANET_ARCHETYPE, PLANET_ARCHETYPES, type PlanetArchetype } from './planetTable'

const FIRST_PLANET = 1

export function planetArchetypeOf(planetIndex: number): PlanetArchetype {
  if (isHeatPlanet(planetIndex)) return HEAT_PLANET_ARCHETYPE
  const last = PLANET_ARCHETYPES.length - 1
  return PLANET_ARCHETYPES[Math.min(planetIndex - FIRST_PLANET, last)]
}
