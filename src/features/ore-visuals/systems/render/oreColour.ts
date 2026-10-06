/**
 * A family's body and glow colours (#151 "family rows"): the hue sits inside the family's band,
 * one position per variant, at the family's saturation; luma climbs through the family's luma
 * band with the kernel's tier rank `t / (t + k)` (#13), so a greyscale screenshot still ranks
 * two tiers of one family and keeps families apart. Low-luma hues (blue, violet) are lightened
 * toward white by `withLuma`, which is the Game Director's fix for the blind-order test.
 */
import { withLuma, type Rgb } from '../../../../systems/render/colour'
import { oreRankOf } from '../../../../systems/render/oreLook'
import type { OreEmissionHue, OreFamilyLook } from '../oreFamilyLooks'

const HUE_TURN = 360
const HUE_SECTOR = 60
const MID_LIGHTNESS = 0.5

/** The variant's hue: variants spread evenly across the band, none on its edges. */
export function oreHueOf(family: OreFamilyLook, variant: number): number {
  const [low, high] = family.hueBand
  return low + ((high - low) * (variant + MID_LIGHTNESS)) / family.variants
}

export function oreBodyColourOf(family: OreFamilyLook, variant: number, tier: number): Rgb {
  const [lumaLow, lumaHigh] = family.lumaBand
  const base = rgbOfHsl(oreHueOf(family, variant), family.saturation, MID_LIGHTNESS)
  return withLuma(base, lumaLow + (lumaHigh - lumaLow) * oreRankOf(tier))
}

/** The family's glow colour at a luma: its own hue, paler than the body (#151 planet tint). */
export function oreGlowColourOf(emission: OreEmissionHue, luma: number): Rgb {
  return withLuma(rgbOfHsl(emission.hue, emission.saturation, MID_LIGHTNESS), luma)
}

/** Hue in degrees, saturation and lightness in 0..1, to sRGB channels (piecewise, no trig). */
export function rgbOfHsl(hue: number, saturation: number, lightness: number): Rgb {
  const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation
  const sector = (((hue % HUE_TURN) + HUE_TURN) % HUE_TURN) / HUE_SECTOR
  const second = chroma * (1 - Math.abs((sector % 2) - 1))
  const [r, g, b] = sectorRgb(Math.floor(sector), chroma, second)
  const lift = lightness - chroma / 2
  return [r + lift, g + lift, b + lift]
}

function sectorRgb(sector: number, chroma: number, second: number): Rgb {
  const bySector: readonly Rgb[] = [
    [chroma, second, 0],
    [second, chroma, 0],
    [0, chroma, second],
    [0, second, chroma],
    [second, 0, chroma],
    [chroma, 0, second],
  ]
  return bySector[sector] ?? bySector[0]
}
