import { describe, expect, it } from 'vitest'
import { sharedGemLooksOf, type PlanetGemLook } from './sharedGemLooks'

// The HS's row 3 on ticket 890: two planets of one act share a gem look when a gem of each wears
// the same cut under the same overlay in colours under 32 channel steps apart (ticket 653).

function planetOf(label: string, change: Partial<PlanetGemLook> = {}): PlanetGemLook {
  return {
    label,
    group: 'fire',
    overlay: 'star',
    gems: [{ cut: 'gem-cut.brilliant', colour: '#b2d7da' }],
    ...change,
  }
}

describe('shared gem looks', () => {
  it('finds two planets of one act laying one cut under one overlay in near colours', () => {
    const p26 = planetOf('1.26', { gems: [{ cut: 'gem-cut.brilliant', colour: '#c9cdcf' }] })
    expect(sharedGemLooksOf([planetOf('1.25'), p26])).toEqual([
      '1.25 and 1.26 share gem-cut.brilliant under star',
    ])
  })

  it('tells the planets apart by another overlay, another cut, colours 32 steps apart or another act', () => {
    const p25 = planetOf('1.25')
    expect(sharedGemLooksOf([p25, planetOf('1.26', { overlay: 'dew' })])).toEqual([])
    const otherCut = { gems: [{ cut: 'gem-cut.oval', colour: '#b2d7da' }] }
    expect(sharedGemLooksOf([p25, planetOf('1.26', otherCut)])).toEqual([])
    const farHue = { gems: [{ cut: 'gem-cut.brilliant', colour: '#b2d7fa' }] }
    expect(sharedGemLooksOf([p25, planetOf('1.26', farHue)])).toEqual([])
    expect(sharedGemLooksOf([p25, planetOf('2.1', { group: 'system 2' })])).toEqual([])
  })

  it('reads no shared look between planets that lay no overlay', () => {
    expect(
      sharedGemLooksOf([planetOf('1.4', { overlay: null }), planetOf('1.5', { overlay: null })]),
    ).toEqual([])
  })
})
