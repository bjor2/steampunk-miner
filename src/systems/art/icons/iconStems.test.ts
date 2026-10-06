import { describe, expect, it } from 'vitest'
import { duplicatedIconStems, iconStemOf, iconUrlsByStem } from './iconStems'

describe('icon stems', () => {
  it("names an icon by its file's stem in the kernel's and a slice's folder alike", () => {
    expect(iconStemOf('./icons/icon-sell.svg')).toBe('icon-sell')
    expect(iconStemOf('../features/ores/icons/icon-ore-tin.svg')).toBe('icon-ore-tin')
  })

  it('finds each icon by its stem, whichever folder ships it', () => {
    const urls = iconUrlsByStem({
      './icons/icon-sell.svg': '/a.svg',
      '../features/ores/icons/icon-ore-tin.svg': '/b.svg',
    })
    expect([...urls]).toEqual([
      ['icon-ore-tin', '/b.svg'],
      ['icon-sell', '/a.svg'],
    ])
  })

  it('lists a stem two folders ship, once', () => {
    const paths = [
      './icons/icon-sell.svg',
      '../features/ores/icons/icon-sell.svg',
      '../features/dynamite/icons/icon-sell.svg',
      '../features/ores/icons/icon-ore-tin.svg',
    ]
    expect(duplicatedIconStems(paths)).toEqual(['icon-sell'])
  })
})
