import { describe, expect, it } from 'vitest'
import { DESIGN_TOKENS } from '../../../systems/views/designSystem'
import { uiScaleOf } from '../../../systems/views/screenLayout'
import { actOf } from '../../planet-mix'
import economyFile from '../solar-systems.economy.json'
import paletteFile from '../palette.json'
import { paletteProblems } from './paletteGuards'
import { ARCHETYPE_PALETTE, mixedActIds } from './paletteRows'

// The archetype palette (ticket 775, P&N lock of 23 Oct): written once, read whole, refused whole.

type Raw = Record<string, unknown>

const ACTS = mixedActIds()
/** A conservative average advance of the body serif (Georgia), in em (planetNames.test.ts). */
const SERIF_ADVANCE_EM = 0.6
const SCREENS: readonly (readonly [number, number])[] = [
  [360, 640],
  [1280, 800],
]

function problemsWith(palette: Raw, economy: Raw = economyFile): string[] {
  return paletteProblems({ ...paletteFile, ...palette }, economy, ACTS)
}

function namesWith(change: Raw): Raw {
  return { names: { ...paletteFile.names, ...change } }
}

function displayFitOf(name: string, [width, height]: readonly [number, number]) {
  const scale = uiScaleOf(Math.min(width, height), false)
  const textPx = name.length * SERIF_ADVANCE_EM * DESIGN_TOKENS.type.sizesPx.display * scale
  return { textPx, roomPx: width - 2 * DESIGN_TOKENS.layout.marginPx * scale }
}

describe('archetype palette', () => {
  it('ships with no problem', () => {
    expect(paletteProblems(paletteFile, economyFile, ACTS)).toEqual([])
  })

  it('names prefixes and a look for every act a planet from campaign index 2 can hold', () => {
    const acts = new Set(Array.from({ length: 99 }, (_, at) => actOf(at + 2).id))
    for (const act of acts) {
      expect(ARCHETYPE_PALETTE.names.prefixesByAct[act]?.length).toBeGreaterThan(0)
      expect(ARCHETYPE_PALETTE.looks.some((look) => look.act === act)).toBe(true)
    }
    expect([...acts].sort()).toEqual(ACTS)
  })

  it('keeps every look apart from every other in both hue and ground motif', () => {
    const { looks } = ARCHETYPE_PALETTE
    expect(new Set(looks.map((look) => look.hue)).size).toBe(looks.length)
    expect(new Set(looks.map((look) => look.groundMotif)).size).toBe(looks.length)
    expect(looks.map((look) => look.id)).toEqual([
      'cinder-basalt',
      'ash-plain',
      'rime-shelf',
      'hoarfrost-vein',
      'lode-banded',
      'gauss-field',
      'hollow-honeycomb',
      'brass-verdigris',
    ])
  })

  it('fits a name of the budget at the display size on 360x640 and 1280x800', () => {
    const budgetName = 'W'.repeat(ARCHETYPE_PALETTE.names.charactersMax)
    for (const screen of SCREENS) {
      const { textPx, roomPx } = displayFitOf(budgetName, screen)
      expect(textPx).toBeLessThanOrEqual(roomPx)
    }
  })

  it('holds the four size classes at x0.9, x1.0, x1.1 and x1.2, XL on a standard start only', () => {
    const { classes, baseTargetSeconds } = ARCHETYPE_PALETTE.sizeClasses
    expect(classes.map((sizeClass) => [sizeClass.id, sizeClass.radiusBp])).toEqual([
      ['S', 9000],
      ['M', 10000],
      ['L', 11000],
      ['XL', 12000],
    ])
    expect(classes.filter((sizeClass) => sizeClass.standardOnly).map((c) => c.id)).toEqual(['XL'])
    expect(classes.map((c) => (baseTargetSeconds * c.radiusBp) / 10000 / 60)).toEqual([
      22.5, 25, 27.5, 30,
    ])
  })

  it('refuses a prefix list that misses an act or names one no planet holds', () => {
    const { fire, ...rest } = paletteFile.names.prefixesByAct
    expect(problemsWith(namesWith({ prefixesByAct: { ...rest, foothold: fire } }))).toEqual([
      'names.prefixesByAct names no act "fire"',
      'names.prefixesByAct names "foothold", which is no mixed act',
    ])
  })

  it('refuses a shared word, a lower-case word and a name over the budget', () => {
    const shared = { ...paletteFile.names.prefixesByAct, frost: ['Rime', 'Ember'] }
    expect(problemsWith(namesWith({ prefixesByAct: shared }))).toEqual([
      'names.prefixesByAct holds the word "Ember" twice',
    ])
    expect(problemsWith(namesWith({ nouns: ['reach'] }))).toEqual([
      'names.nouns must list capitalised words',
    ])
    expect(problemsWith(namesWith({ nouns: ['Counterweighting'] }))[0]).toBe(
      'names: the longest name with 3 digits takes 30 characters, over 22',
    )
  })

  it('refuses a hook template without its slots or with a slot it has no answer for', () => {
    const hookTemplates = { mindful: 'Folio {g}.', paying: 'Folio {g}: mind the {mind}.' }
    expect(problemsWith(namesWith({ hookTemplates }))).toEqual([
      'names.hookTemplates.mindful lacks {ground}',
      'names.hookTemplates.mindful lacks {pays}',
      'names.hookTemplates.mindful lacks {mind}',
      'names.hookTemplates.paying lacks {ground}',
      'names.hookTemplates.paying lacks {pays}',
      'names.hookTemplates.paying names {mind}, which it has no slot for',
    ])
  })

  it('refuses two looks sharing a hue or a motif, and a look of no act', () => {
    const [first, ...rest] = paletteFile.looks
    const twin = { ...first, id: 'cinder-twin', act: 'ice' }
    expect(problemsWith({ looks: [...rest, first, twin] })).toEqual([
      'looks names "ice", which is no mixed act',
      'looks holds the hue "black/orange glow" twice',
      'looks holds the groundMotif "hex basalt columns" twice',
    ])
  })

  it('refuses a new family with a display-name id, a stray kind or a shared name', () => {
    const [first, ...rest] = paletteFile.newContentSlots.families
    const families = [
      { ...first, id: 'Vent flares', kind: 'weather' },
      ...rest,
      { ...rest[0], id: 'twin_salt' },
    ]
    expect(problemsWith({ newContentSlots: { set: 'SS2-B', families } })).toEqual([
      'newContentSlots.families[0].id must be snake_case',
      'newContentSlots.families[0].kind must be one of enemy, hazard, ore_family',
      'newContentSlots.families holds the name "Cinder salts" twice',
    ])
  })

  it('refuses size classes without the x1.0 class or a class a hard start may draw', () => {
    const classes = [{ id: 'XL', radiusBp: 12000, standardOnly: true }]
    const economy = { ...economyFile, sizeClasses: { baseTargetSeconds: 1500, classes } }
    expect(problemsWith({}, economy)).toEqual([
      'sizeClasses.classes must hold the x1.0 class (10000 bp)',
      'sizeClasses.classes must hold a class a hard start may draw',
    ])
  })
})
