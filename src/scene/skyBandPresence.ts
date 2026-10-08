/**
 * The sky band the mounted `PlanetSkyBand` draws now (#293), for the debug reads: set while a band
 * is mounted. A plain module record, never React state or the store.
 */
import type { PlanetSkyBandLook } from '../systems/registries/planetSkyBand'

export interface DrawnSkyBand {
  look: PlanetSkyBandLook
  /** Whether the ribbon art draws it, not the procedural curtains. */
  isRibbonDrawn: boolean
}

export const skyBandPresence: { drawn: DrawnSkyBand | null } = { drawn: null }

/** Shows the band until the returned call takes it back. */
export function showSkyBand(look: PlanetSkyBandLook, isRibbonDrawn: boolean): () => void {
  const drawn = { look, isRibbonDrawn }
  skyBandPresence.drawn = drawn
  return () => {
    if (skyBandPresence.drawn === drawn) skyBandPresence.drawn = null
  }
}

/** The band drawn now; null on a planet with none. */
export function drawnSkyBand(): DrawnSkyBand | null {
  return skyBandPresence.drawn
}
