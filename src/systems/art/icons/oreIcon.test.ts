import { describe, expect, it } from 'vitest'
import { isOreIconId, oreIconIdOf, oreIconSvgOf, parseOreIconId } from './oreIcon'

describe('ore icons (#158: generated from the ore look)', () => {
  it('names an icon by family and tier and reads it back', () => {
    expect(oreIconIdOf('crystal', 7)).toBe('icon-ore-crystal-t7')
    expect(parseOreIconId('icon-ore-crystal-t7')).toEqual({ family: 'crystal', tier: 7 })
    expect(isOreIconId('icon-track-hull')).toBe(false)
    expect(parseOreIconId('icon-ore-metal-t0')).toBeNull()
  })

  it('draws a hex in the family hue with the grade as pips, for any tier', () => {
    const tier7 = oreIconSvgOf({ family: 'metal', tier: 7 })
    expect(tier7).toContain('data-frame="hex"')
    expect(tier7).toContain('data-grade="2"')
    expect((tier7.match(/<circle/g) ?? []).length).toBe(2)
    expect(oreIconSvgOf({ family: 'crystal', tier: 124 })).toContain('data-grade="5"')
  })

  it('brightens with tier, so a greyscale sheet still ranks two tiers', () => {
    const fillOf = (svg: string) => /<path d="M[^"]*" fill="(#[0-9a-f]{6})"/.exec(svg)![1]
    const luma = (hex: string) =>
      [1, 3, 5].map((at) => parseInt(hex.slice(at, at + 2), 16)).reduce((a, b) => a + b)
    expect(luma(fillOf(oreIconSvgOf({ family: 'mixed', tier: 20 })))).toBeGreaterThan(
      luma(fillOf(oreIconSvgOf({ family: 'mixed', tier: 2 }))),
    )
  })
})
