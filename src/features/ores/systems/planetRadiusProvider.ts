/**
 * The planet registry's radii as the kernel's one `planetRadius` provider (ticket 643): world
 * generation reads a fresh planet's radius from its row (`planetRows.ts`, ticket 642), and a planet
 * past the last row gets none, so it keeps #6's ladder.
 */
import type { PlanetRadiusProvider } from '../../../systems/registries/planetRadii'
import { ORE_ROWS } from './oreRows'
import { radiusTilesOfPlanet } from './planetRows'

export const PLANET_RADIUS_PROVIDER: PlanetRadiusProvider = {
  id: 'ores.planet-radius',
  radiusTilesOf: (planetIndex) => radiusTilesOfPlanet(ORE_ROWS.planets, planetIndex),
}
