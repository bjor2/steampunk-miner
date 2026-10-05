/**
 * Procedural band colours (#13): each planet palette names a surface and a deep colour, and the
 * five depth bands step evenly between them. A per-tile shade from the cell hash gives the subtle
 * noise texture, so tiles are never painted one by one.
 */
import { SKY_FADE_DEPTH_TILES } from '../../constants/scene'
import { cellRandomFloat } from '../cellRandom'
import { BAND_COUNT } from '../world/planetGeometry'
import { ART_DIRECTION, type BandPalette } from './artDirection'
import { mixRgb, scaleRgb, type Rgb } from './colour'

export function paletteOf(paletteId: string): BandPalette {
  const palette = ART_DIRECTION.palettes[paletteId]
  if (palette === undefined) throw new RangeError(`no palette "${paletteId}" in artDirection.json`)
  return palette
}

/** Band 1 is the surface colour, band 5 the deep colour. */
export function bandColourOf(palette: BandPalette, band: number): Rgb {
  return mixRgb(palette.surface, palette.deep, (band - 1) / (BAND_COUNT - 1))
}

/** A brightness factor around 1, fixed per tile, within the art direction's spread. */
export function tileShadeOf(seed: number, tx: number, ty: number): number {
  return 1 + ART_DIRECTION.tileShadeSpread * (2 * cellRandomFloat(seed, tx, ty) - 1)
}

export function shadedRgb(colour: Rgb, shade: number): Rgb {
  return scaleRgb(colour, shade)
}

/** The background behind the view: sky at the surface, the underground dark below it. */
export function skyColourAt(palette: BandPalette, depthTiles: number): Rgb {
  const share = Math.min(1, Math.max(0, depthTiles / SKY_FADE_DEPTH_TILES))
  return mixRgb(palette.sky, palette.underground, share)
}
