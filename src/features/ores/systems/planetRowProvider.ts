/**
 * The planet registry as the kernel's one `planetRow` provider (GD lock on #707): each planet's
 * name (ticket 702), pool (ticket 542), look (ticket 653) and frozen radius (ticket 643) from its
 * row (`planetRows.ts`), and a planet past the last row its generated name alone.
 */
import type { PlanetRowProvider } from '../../../systems/registries/planetRow'
import { ORE_ROWS } from './oreRows'
import { planetRowFieldsOf } from './planetRows'

export const PLANET_ROW_PROVIDER: PlanetRowProvider = {
  id: 'ores.planet-row',
  rowOf: (planetIndex) => planetRowFieldsOf(ORE_ROWS.planets, planetIndex),
}
