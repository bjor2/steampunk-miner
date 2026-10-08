/**
 * A band of light in a planet's sky, just above its surface (GD ruling on #293 Q1, from the TD's
 * proposal): the magnetic planet's aurora first, and the frozen and hollow classes may reuse it, so
 * it is a planet-atmosphere seam, not a magnetic special case. One provider at most (`planet-mix`);
 * with none, or where it answers null, no planet draws a band. The kernel's `PlanetSkyBand` draws
 * the look as one ring mesh round the planet, 1 draw call from #38's co-op headroom, outside the
 * slices' `SCENE_LAYER_LINE`. Presentation only: nothing here reaches the authority state, a
 * snapshot or a digest.
 */
import type { PlanetParams } from '../world/planetParams'
import { defineOneProviderRegistry, entriesOf } from './seal'

/** A part of a Blender `parts` asset whose texture the band repeats round the planet. */
export interface SkyBandRibbon {
  assetId: string
  partId: string
}

export interface PlanetSkyBandLook {
  /** The band's light, a display `#rrggbb`. */
  colour: string
  /** How far above the surface radius the band's lower edge sits, in metres (one tile). */
  heightM: number
  /** How tall the band is, in metres. */
  thicknessM: number
  /** How strongly its light flickers, 0 (steady) to 1; reduce motion holds it steady. */
  flicker: number
  /** The texture repeated along the band; null draws the kernel's procedural curtains. */
  ribbon: SkyBandRibbon | null
}

export interface PlanetSkyBandProvider {
  id: string
  /** The planet's band; null for none. */
  bandOf(params: PlanetParams): PlanetSkyBandLook | null
}

/** A band thinner than this would vanish between the ring's pixels. */
export const MIN_SKY_BAND_THICKNESS_M = 0.25

export const PLANET_SKY_BAND_REGISTRY =
  defineOneProviderRegistry<PlanetSkyBandProvider>('planetSkyBand')

/** The planet's band, held to sane bounds; null with no provider or where it answers none. */
export function planetSkyBandOf(params: PlanetParams): PlanetSkyBandLook | null {
  const [provider] = entriesOf(PLANET_SKY_BAND_REGISTRY)
  const look = provider?.bandOf(params) ?? null
  return look === null ? null : boundedLook(look)
}

function boundedLook(look: PlanetSkyBandLook): PlanetSkyBandLook {
  return {
    ...look,
    heightM: Math.max(0, look.heightM),
    thicknessM: Math.max(MIN_SKY_BAND_THICKNESS_M, look.thicknessM),
    flicker: Math.min(Math.max(look.flicker, 0), 1),
  }
}
