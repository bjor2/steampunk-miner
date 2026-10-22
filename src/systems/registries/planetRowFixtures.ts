/**
 * Spec fixtures for the `planetRow` registry: a provider whose rows hold a frozen radius alone, so
 * a spec sizes a planet without the `ores` slice's rows.
 */
import { RADIUS_ROWS_ORE_RULES } from '../world/planetParams'
import type { PlanetRowProvider } from './planetRow'

/** Freezes the radius `tilesOf` answers from ore rules 7; a planet it answers null for keeps the ladder. */
export function frozenRadiusProvider(
  tilesOf: (planetIndex: number) => number | null,
): PlanetRowProvider {
  return {
    id: 'fake.planet-row',
    rowOf: (planetIndex) => {
      const tiles = tilesOf(planetIndex)
      if (tiles === null) return {}
      return { radius: { tiles, fromOreRules: RADIUS_ROWS_ORE_RULES, reason: 'spec fixture' } }
    },
  }
}
