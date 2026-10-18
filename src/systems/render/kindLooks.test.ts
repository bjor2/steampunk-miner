import { describe, expect, it } from 'vitest'
import {
  KIND_LOOKS,
  kindLookCatalogueProblems,
  MIN_STROKE_TILES,
  NO_KIND_LOOK_CODE,
  patternCodeOf,
  silhouetteCodeOf,
  thinnestStrokeOf,
  type KindPattern,
  type PatternPrimitive,
} from './kindLooks'
import lookFile from './kindLooks.json'

/** The pattern shades the shader turns by `angle`; the rest ignore it. */
const DIRECTED: readonly PatternPrimitive[] = ['bands', 'gloss', 'fibres']

/** What the shader reads of a pattern row: a core ignores its scale, an undirected shade its angle. */
function drawnShadeOf({ primitive, scale, contrast, angle }: KindPattern): string {
  const drawnScale = primitive === 'core' ? 0 : scale
  const drawnAngle = DIRECTED.includes(primitive) ? angle : 0
  return [primitive, drawnScale, contrast, drawnAngle].join(' ')
}

function repeatsOf(keys: readonly string[]): string[] {
  return keys.filter((key, at) => keys.indexOf(key) !== at)
}

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

  it('draws every silhouette and every pattern unlike any other, so a new id is a new look', () => {
    const shapes = KIND_LOOKS.silhouettes.map(({ id: _id, ...shape }) => JSON.stringify(shape))
    expect(repeatsOf(shapes)).toEqual([])
    expect(repeatsOf(KIND_LOOKS.patterns.map(drawnShadeOf))).toEqual([])
  })

  it('refuses a grain whose thinnest stroke would blur away at phone size', () => {
    const thin = { id: 'hairs', primitive: 'ring', count: 2, size: 0.1, aspect: 0.3, turn: 0 }
    const file = { silhouettes: [{ ...thin, layout: 'scatter' }], patterns: [] }
    expect(kindLookCatalogueProblems(file)).toEqual([
      'silhouettes[0] draws a stroke under 0.06 tiles, lost at phone size',
    ])
    expect(
      KIND_LOOKS.silhouettes.filter((row) => thinnestStrokeOf(row) < MIN_STROKE_TILES),
    ).toEqual([])
  })

  it('refuses an id the shader cannot draw', () => {
    expect(() => silhouetteCodeOf('tentacles')).toThrow(/draws no silhouette "tentacles"/)
    expect(() => patternCodeOf('plaid')).toThrow(/draws no pattern "plaid"/)
  })

  it('lists every problem of a broken file', () => {
    const broken = {
      silhouettes: [
        { id: 'blob', primitive: 'tentacle', count: 9, size: 1, aspect: 1, turn: 0, layout: 'row' },
        { id: 'blob', primitive: 'disc', count: 1, size: 0.1, aspect: 1, turn: 0, layout: 'row' },
      ],
      patterns: [{ id: 'Plaid', primitive: 'flat', scale: 0, contrast: 2, angle: 0 }],
    }
    expect(kindLookCatalogueProblems(broken)).toEqual([
      'silhouettes[0].primitive must be one of box, diamond, disc, hexagon, rod, ring, star, triangle',
      'silhouettes[0].count must be a whole number in 1..6',
      'silhouettes[0].size must be a number in 0.02..0.4',
      'patterns[0].id must be kebab-case',
      'patterns[0].scale must be above 0',
      'patterns[0].contrast must be a number in -0.7..0.7',
      'silhouettes share the id blob; each needs its own',
    ])
  })
})
