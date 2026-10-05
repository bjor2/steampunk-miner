import { describe, expect, it } from 'vitest'
import { PLANET_ARCHETYPES } from '../world/planetTable'
import { bandColourOf, paletteOf, skyColourAt, tileShadeOf } from './bandPalette'
import { lumaOf } from './colour'

describe('band palette', () => {
  it('has a palette for every planet archetype', () => {
    PLANET_ARCHETYPES.forEach(({ paletteId }) => expect(() => paletteOf(paletteId)).not.toThrow())
  })

  it('refuses a palette id the art direction does not define', () => {
    expect(() => paletteOf('palette.nowhere')).toThrow(/palette\.nowhere/)
  })

  it('darkens band by band from the surface to the core region', () => {
    const palette = paletteOf('palette.planet_1')
    const lumas = [1, 2, 3, 4, 5].map((band) => lumaOf(bandColourOf(palette, band)))
    lumas.slice(1).forEach((luma, index) => expect(luma).toBeLessThan(lumas[index]))
  })

  it('starts at the surface colour and ends at the deep colour', () => {
    const palette = paletteOf('palette.planet_2')
    expect(bandColourOf(palette, 1)).toEqual(palette.surface)
    bandColourOf(palette, 5).forEach((channel, index) =>
      expect(channel).toBeCloseTo(palette.deep[index], 9),
    )
  })

  it('shades a tile the same way every time, within a few percent', () => {
    const shade = tileShadeOf(83921, -40, 299)
    expect(tileShadeOf(83921, -40, 299)).toBe(shade)
    expect(Math.abs(shade - 1)).toBeLessThanOrEqual(0.08)
  })

  it('fades the sky to the underground dark as the vehicle goes down', () => {
    const palette = paletteOf('palette.planet_1')
    expect(skyColourAt(palette, 0)).toEqual(palette.sky)
    expect(skyColourAt(palette, -5)).toEqual(palette.sky)
    skyColourAt(palette, 400).forEach((channel, index) =>
      expect(channel).toBeCloseTo(palette.underground[index], 9),
    )
  })
})
