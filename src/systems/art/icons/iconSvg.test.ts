import { describe, expect, it } from 'vitest'
import { iconEntries, iconEntryOf, type IconEntry } from './iconSet'
import { iconSvgOf, ICON_COLOURS, ICON_INK, num } from './iconSvg'

const entry = (id: string): IconEntry => iconEntryOf(id) as IconEntry

describe('icon svg', () => {
  it('writes a 24-grid document titled for the thing, marked with its frame and axis', () => {
    const svg = iconSvgOf(entry('icon-track-hull'))
    expect(svg).toContain('viewBox="0 0 24 24"')
    expect(svg).toContain('<title>Hull</title>')
    expect(svg).toContain('data-frame="plate" data-axis="brass"')
  })

  it('fills the frame in the axis colour and cuts the silhouette in ink', () => {
    const svg = iconSvgOf(entry('icon-track-gun'))
    expect(svg).toContain(`fill="${ICON_COLOURS.verdigris}" stroke="${ICON_INK}"`)
    expect(svg).toContain(`fill="${ICON_INK}" fill-rule="evenodd"`)
  })

  it('draws a frameless gauge glyph as the silhouette in its colour with an ink outline', () => {
    const svg = iconSvgOf(entry('icon-gauge-energy'))
    expect(svg).not.toContain('<rect')
    expect(svg).toContain(`fill="${ICON_COLOURS.brass}" stroke="${ICON_INK}"`)
  })

  it('wears the bay accent on an emblem', () => {
    expect(iconSvgOf(entry('emblem-bay-sell'))).toContain('fill="#b87333"')
  })

  it('composes every entry of the set', () => {
    for (const each of iconEntries()) expect(iconSvgOf(each)).toContain('</svg>')
  })

  it('rounds coordinates to two decimals so the files match on every machine', () => {
    expect(num(1 / 3)).toBe('0.33')
    expect(num(2)).toBe('2')
  })
})
