/**
 * The planet registry's looks as the kernel's one `planetLook` provider (ticket 653): the terrain,
 * the sky and the sky band read a planet's rock tint, horizon and band from its row
 * (`planetLooks.ts`), and a planet whose row holds none keeps its archetype's look.
 */
import type { PlanetLookProvider } from '../../../systems/registries/planetLooks'
import { ORE_ROWS } from './oreRows'
import { lookOfPlanet } from './planetRows'

export const PLANET_LOOK_PROVIDER: PlanetLookProvider = {
  id: 'ores.planet-look',
  lookOf: (planetIndex) => lookOfPlanet(ORE_ROWS.planets, planetIndex),
}
