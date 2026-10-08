/**
 * The art a planet's sky band draws with (GD ruling on #293 Q1): the provider names a part of a
 * Blender `parts` asset as its ribbon, and once that asset is final the band repeats the part's
 * atlas rectangle round the planet at the part's own aspect over the band's thickness. Until then,
 * or with no ribbon named, the kernel shader draws procedural curtains, so the band never waits on
 * art (#52 "Placeholders").
 */
import { SKY_BAND_CURTAIN_REPEAT_M } from '../../constants/scene'
import type { ArtCatalogue } from '../art/artCatalogue'
import { assetQuadsOf, atlasMapsOf, type AtlasMaps, type AtlasUv } from '../art/assetLook'
import type { PlanetSkyBandLook } from '../registries/planetSkyBand'

export interface SkyBandRibbonArt {
  maps: AtlasMaps
  uv: AtlasUv
  /** One ribbon's length along the band, metres. */
  lengthM: number
}

/** A non-tiered asset shows every part at any tier. */
const ANY_TIER = 1

/** The ribbon's atlas rectangle once its asset is final; null draws the procedural curtains. */
export function skyBandRibbonArtOf(
  art: ArtCatalogue,
  look: PlanetSkyBandLook,
): SkyBandRibbonArt | null {
  if (look.ribbon === null) return null
  const { assetId, partId } = look.ribbon
  const maps = atlasMapsOf(art, assetId)
  const quad = assetQuadsOf(art, assetId, ANY_TIER).find((shown) => shown.partId === partId)
  if (maps === null || quad === undefined || quad.uv === null) return null
  const [width, height] = quad.size
  return { maps, uv: quad.uv, lengthM: (look.thicknessM * width) / height }
}

/** How far round the band one ribbon (or one run of curtains) reaches, metres. */
export function skyBandRepeatOf(ribbonArt: SkyBandRibbonArt | null): number {
  return ribbonArt?.lengthM ?? SKY_BAND_CURTAIN_REPEAT_M
}

/** The map whose light the band repeats: the ribbon's glow where it bakes one, else its colour. */
export function skyBandRibbonMapOf(ribbonArt: SkyBandRibbonArt): string {
  return ribbonArt.maps.emissive ?? ribbonArt.maps.albedo
}
