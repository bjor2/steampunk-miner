import { describe, expect, it } from 'vitest'
import {
  KIND_LOOKS,
  kindLookCatalogueProblems,
  NO_KIND_LOOK_CODE,
  patternCodeOf,
  silhouetteCodeOf,
} from './kindLooks'
import lookFile from './kindLooks.json'

describe('material look catalogue', () => {
  it('loads the shipped silhouettes and patterns with no problem', () => {
    expect(kindLookCatalogueProblems(lookFile)).toEqual([])
    expect(KIND_LOOKS.silhouettes.length).toBeGreaterThan(0)
    expect(KIND_LOOKS.patterns.length).toBeGreaterThan(0)
  })

  it('codes each silhouette and pattern by its place plus one, so 0 stays the family look', () => {
    const [first] = KIND_LOOKS.silhouettes
    const last = KIND_LOOKS.patterns[KIND_LOOKS.patterns.length - 1]
    expect(silhouetteCodeOf(first.id)).toBe(NO_KIND_LOOK_CODE + 1)
    expect(patternCodeOf(last.id)).toBe(KIND_LOOKS.patterns.length)
  })

  it('refuses an id the shader cannot draw', () => {
    expect(() => silhouetteCodeOf('tentacles')).toThrow(/draws no silhouette "tentacles"/)
    expect(() => patternCodeOf('plaid')).toThrow(/draws no pattern "plaid"/)
  })

  it('lists every problem of a broken file', () => {
    const broken = {
      silhouettes: [
        { id: 'blob', primitive: 'star', count: 9, size: 1, aspect: 1, turn: 0, layout: 'row' },
        { id: 'blob', primitive: 'disc', count: 1, size: 0.1, aspect: 1, turn: 0, layout: 'row' },
      ],
      patterns: [{ id: 'Plaid', primitive: 'flat', scale: 0, contrast: 2, angle: 0 }],
    }
    expect(kindLookCatalogueProblems(broken)).toEqual([
      'silhouettes[0].primitive must be one of box, diamond, disc, hexagon, rod',
      'silhouettes[0].count must be a whole number in 1..6',
      'silhouettes[0].size must be a number in 0.02..0.4',
      'patterns[0].id must be kebab-case',
      'patterns[0].scale must be above 0',
      'patterns[0].contrast must be a number in 0..0.7',
      'silhouettes share the id blob; each needs its own',
    ])
  })
})
