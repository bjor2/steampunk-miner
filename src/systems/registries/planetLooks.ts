/**
 * A planet's own look from its planet registry row (ticket 653, spec #647; the Horizontal Scaler's
 * "one per-planet data row (pool, radius, solar system, look)"): the rock tint, the horizon behind
 * the surface and the band of light along it. Keyed by planet index alone, so a planet looks the
 * same on every seed and under every ore rules stamp. One provider at most (`ores`); with none, or
 * where it answers null, the planet wears its archetype's palette (#13) and its class band alone
 * (#293). Presentation only: nothing here reaches `PlanetParams`, the authority state, a save or a
 * digest, so existing worlds keep their stamp and load as they did.
 */
import type { PlanetSkyBandLook } from './planetSkyBand'
import { defineOneProviderRegistry, entriesOf } from './seal'

export interface PlanetLook {
  /** Band 1's ground, a display `#rrggbb`; bands 2 to 4 step toward `rockDeep` (#13). */
  rockSurface: string
  /** Band 5's ground, a display `#rrggbb`. */
  rockDeep: string
  /** The sky behind the surface, a display `#rrggbb`; it fades to the underground dark with depth. */
  horizon: string
  /** The band of light along the horizon; a planet class's own band (#293) wins over it. */
  skyBand: PlanetSkyBandLook
}

export interface PlanetLookProvider {
  id: string
  /** The planet's look; null where its row holds none. */
  lookOf(planetIndex: number): PlanetLook | null
}

export const PLANET_LOOK_REGISTRY = defineOneProviderRegistry<PlanetLookProvider>('planetLook')

/** The planet's own look; null with no provider or where its row holds none. */
export function planetLookOf(planetIndex: number): PlanetLook | null {
  const [provider] = entriesOf(PLANET_LOOK_REGISTRY)
  return provider?.lookOf(planetIndex) ?? null
}
