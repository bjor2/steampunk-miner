/**
 * The planet registry's names as the kernel's one `planetName` provider (ticket 702): a menu asks
 * the kernel for a planet's display name and gets its row's name (planets 1 to 7) or the generated
 * one (`planetNames.ts`).
 */
import type { PlanetNameProvider } from '../../../systems/registries/planetNames'
import { ORE_ROWS } from './oreRows'
import { nameOfPlanet } from './planetRows'

export const PLANET_NAME_PROVIDER: PlanetNameProvider = {
  id: 'ores.planet-name',
  nameOf: (planetIndex) => nameOfPlanet(ORE_ROWS.planets, planetIndex),
}
