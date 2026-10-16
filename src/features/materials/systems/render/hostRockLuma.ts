/**
 * The brightest host rock a material can sit in (#151: "luma bands sit above the host rock", band 1
 * 0.43 to band 5 0.19 on planet 1): the highest Rec. 601 luma of any band colour of any planet
 * palette, so a hue slot above it reads as ore on every planet and in every band. Measured from the
 * kernel palettes, never copied, so a palette edit moves the guard with it.
 */
import { bandColourOf, paletteOf } from '../../../../systems/render/bandPalette'
import { lumaOf } from '../../../../systems/render/colour'
import { BAND_COUNT } from '../../../../systems/world/planetGeometry'
import { HEAT_PLANET_ARCHETYPE, PLANET_ARCHETYPES } from '../../../../systems/world/planetTable'

export function brightestHostRockLuma(): number {
  return Math.max(...hostRockPaletteIds().flatMap(bandLumasOfPalette))
}

function hostRockPaletteIds(): string[] {
  return [...PLANET_ARCHETYPES, HEAT_PLANET_ARCHETYPE].map((archetype) => archetype.paletteId)
}

function bandLumasOfPalette(paletteId: string): number[] {
  const palette = paletteOf(paletteId)
  return Array.from({ length: BAND_COUNT }, (_, at) => lumaOf(bandColourOf(palette, at + 1)))
}
