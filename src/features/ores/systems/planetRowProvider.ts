/**
 * The planet registry as the kernel's one `planetRow` provider (GD lock on #707): each planet's
 * name (ticket 702), pool (ticket 542), look (ticket 653) and frozen radius (ticket 643) from its
 * row (`planetRows.ts`), and a planet past the last row its generated name alone. Every planet's
 * gem sale tiers are the formula (`gemTiers.ts`, ticket 741) under the ore rules a fresh planet is
 * entered under, never a row's.
 */
import type { PlanetRowFields, PlanetRowProvider } from '../../../systems/registries/planetRow'
import { oreRulesVersionOnEntry } from '../../../systems/world/planetParams'
import { gemSaleTiersOf } from './gemTiers'
import { ORE_ROWS } from './oreRows'
import { planetRowFieldsOf } from './planetRows'

export const PLANET_ROW_PROVIDER: PlanetRowProvider = {
  id: 'ores.planet-row',
  rowOf: planetRowOfRegistry,
}

function planetRowOfRegistry(planetIndex: number): PlanetRowFields {
  return {
    ...planetRowFieldsOf(ORE_ROWS.planets, planetIndex),
    gemSaleTiers: gemSaleTiersOf(planetIndex, oreRulesVersionOnEntry(planetIndex)),
  }
}
