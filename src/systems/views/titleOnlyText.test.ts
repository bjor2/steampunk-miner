import { describe, expect, it } from 'vitest'
import { titleOnlyTextsOf } from './titleOnlyText'

describe('title-only text', () => {
  it('finds a hover title whose words no drawn line shows', () => {
    const markup = '<span title="HULL CRITICAL"><svg></svg></span>'
    expect(titleOnlyTextsOf(markup)).toEqual(['HULL CRITICAL'])
  })

  it('accepts a title that a drawn line repeats', () => {
    const markup = '<button title="Overpressure">Overpressure</button>'
    expect(titleOnlyTextsOf(markup)).toEqual([])
  })

  it('counts a tooltip plate as drawn, since a tap opens it', () => {
    const markup =
      '<span title="Assay Beacon">◈ 12</span><div data-tooltip="dock.shop.t1" hidden="">Assay Beacon: mid-band</div>'
    expect(titleOnlyTextsOf(markup)).toEqual([])
  })

  it('reads escaped text the way the screen shows it', () => {
    const markup = '<i title="Fuel &amp; air"></i><p>Fuel &amp; air</p><i title="A &lt; B"></i>'
    expect(titleOnlyTextsOf(markup)).toEqual(['A < B'])
  })

  it('ignores data attributes that merely end in title', () => {
    expect(titleOnlyTextsOf('<div data-title="x"></div>')).toEqual([])
  })
})
