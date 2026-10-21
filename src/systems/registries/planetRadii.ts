/**
 * Each planet's radius from the planet registry (GD lock R2 on #302, 6306854642; ticket 643). The
 * `ores` slice owns the registry row that holds a planet's species pool and its frozen radius
 * (ticket 642), so it provides the radius and world generation asks here. One provider at most;
 * with none, or past the registry's last row, the planet has no row and keeps #6's ladder
 * (`planetParams.ts`).
 */
import { defineOneProviderRegistry, entriesOf } from './seal'

export interface PlanetRadiusProvider {
  id: string
  /** The planet's frozen radius in tiles; null for a planet the registry has no row for. */
  radiusTilesOf(planetIndex: number): number | null
}

export const PLANET_RADIUS_REGISTRY =
  defineOneProviderRegistry<PlanetRadiusProvider>('planetRadius')

/** The registry row's radius in tiles; null with no provider or past the last row. */
export function rowRadiusTilesOf(planetIndex: number): number | null {
  const [provider] = entriesOf(PLANET_RADIUS_REGISTRY)
  return provider?.radiusTilesOf(planetIndex) ?? null
}
