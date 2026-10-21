import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  COARSE_TARGET_PX,
  HUD_COMPACT_ANY_POINTER_SHORT_AXIS_PX,
  HUD_COMPACT_COARSE_SHORT_AXIS_PX,
  MIN_TARGET_PX,
} from '../../constants/screen'
import { DESIGN_TOKENS } from './designSystem'
import {
  colourPropertyOf,
  designTokenSheetOf,
  planetSkinStyleOf,
  TOKEN_SHEET_SELECTORS,
  type DesignTokenSheet,
} from './designTokenCss'
import { screenAttributesOf, screenLayoutOf } from './screenLayout'

// Ticket 682 (spec #678): `tokens.css` declares every token of designTokens.json as the mapping
// names it, under the root attributes the shell writes, so the JSON stays the one source.

const TOKENS_SHEET = new URL('../../ui/kit/tokens.css', import.meta.url)

/** The sheet's rule blocks: selector to its custom properties, comments dropped. */
function declaredBlocksOf(css: string): Map<string, Map<string, string>> {
  const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, '')
  const blocks = new Map<string, Map<string, string>>()
  for (const [, selector, body] of withoutComments.matchAll(/([^{}]+)\{([^}]*)\}/g)) {
    blocks.set(selector.replace(/\s+/g, ' ').trim(), declarationsOf(body))
  }
  return blocks
}

function declarationsOf(body: string): Map<string, string> {
  const pairs = body
    .split(';')
    .map((line) => line.trim())
    .filter((line) => line.startsWith('--'))
    .map((line) => [line.slice(0, line.indexOf(':')), line.slice(line.indexOf(':') + 1).trim()])
  return new Map(pairs.map(([name, value]) => [name, value.replace(/\s+/g, ' ')]))
}

const declared = declaredBlocksOf(readFileSync(TOKENS_SHEET, 'utf8'))
const sheet = designTokenSheetOf()

describe('design tokens: tokens.css', () => {
  it.each(Object.keys(TOKEN_SHEET_SELECTORS) as (keyof DesignTokenSheet)[])(
    'declares every %s token with the value the JSON gives it',
    (block) => {
      const properties = declared.get(TOKEN_SHEET_SELECTORS[block]) ?? new Map<string, string>()
      const wrong = Object.entries(sheet[block])
        .filter(([name, value]) => properties.get(name) !== value)
        .map(([name, value]) => `${name}: ${value} (sheet has ${properties.get(name)})`)
      expect(wrong).toEqual([])
    },
  )

  it('switches only properties the root already declares, so phone is the default layout', () => {
    const rootNames = Object.keys(sheet.root)
    const switched = [...Object.keys(sheet.desktop), ...Object.keys(sheet.phoneLandscape)]
    expect(switched.filter((name) => !rootNames.includes(name))).toEqual([])
  })

  it('keeps the colours the sheet carried before the design system', () => {
    expect(sheet.root).toMatchObject({
      '--color-bg': '#1b1613',
      '--color-panel': 'rgb(27 22 19 / 0.85)',
      '--color-text': '#f3ead8',
      '--color-brass': '#c9a24b',
      '--space-1': 'calc(4px * var(--ui-scale))',
      '--radius-panel': '6px',
    })
  })

  it('sets every type size as rem at or above the 14 px floor', () => {
    expect(sheet.root['--type-min']).toBe('0.875rem')
    expect(sheet.root['--type-label']).toBe('0.875rem')
    expect(sheet.root['--type-display']).toBe('1.5rem')
  })

  it('lays the strip, slot cells and glow out per layout', () => {
    expect(sheet.root).toMatchObject({
      '--strip-height': '36px',
      '--slot-cell': '44px',
      '--slot-columns': '3',
    })
    expect(sheet.desktop).toEqual({
      '--strip-height': '44px',
      '--strip-max-width': '720px',
      '--slot-cell': '48px',
      '--slot-columns': '9',
      '--warn-glow-thickness': '32px',
    })
    expect(sheet.phoneLandscape).toEqual({ '--slot-columns': '6' })
  })

  it('pushes every HUD edge in by its safe inset, the strip with no margin', () => {
    expect(sheet.root['--hud-inset-top']).toBe('var(--safe-top)')
    expect(sheet.root['--hud-inset-bottom']).toBe('calc(var(--safe-bottom) + var(--layout-margin))')
  })
})

describe('design tokens: breakpoints', () => {
  it('writes data-layout phone on a phone and desktop on a desktop', () => {
    const phone = screenLayoutOf(
      { widthPixels: 360, heightPixels: 640, isCoarsePointer: true },
      false,
    )
    const desktop = screenLayoutOf(
      { widthPixels: 1440, heightPixels: 900, isCoarsePointer: false },
      false,
    )
    expect(screenAttributesOf(phone)['data-layout']).toBe('phone')
    expect(screenAttributesOf(desktop)['data-layout']).toBe('desktop')
  })

  it('keeps a tablet under a finger on the phone layout and a small window on any pointer', () => {
    const tablet = screenLayoutOf(
      { widthPixels: 1024, heightPixels: 768, isCoarsePointer: true },
      false,
    )
    const smallWindow = screenLayoutOf(
      { widthPixels: 640, heightPixels: 480, isCoarsePointer: false },
      false,
    )
    expect(screenAttributesOf(tablet)['data-layout']).toBe('phone')
    expect(screenAttributesOf(smallWindow)['data-layout']).toBe('phone')
  })

  it('switches on the same short axes the HUD density switch uses', () => {
    const { phone } = DESIGN_TOKENS.layout.breakpoints
    expect(phone.coarseShortAxisBelowPx).toBe(HUD_COMPACT_COARSE_SHORT_AXIS_PX)
    expect(phone.anyPointerShortAxisBelowPx).toBe(HUD_COMPACT_ANY_POINTER_SHORT_AXIS_PX)
  })

  it('asks the same tap targets the controls are held to', () => {
    expect(DESIGN_TOKENS.layout.tapTargetMinPx).toBe(MIN_TARGET_PX)
    expect(DESIGN_TOKENS.layout.coarseTargetPx).toBe(COARSE_TARGET_PX)
  })
})

describe('design tokens: planet skins', () => {
  it('writes the skin of a skinned planet over the four skinnable colours', () => {
    expect(planetSkinStyleOf('palette.planet_2')).toEqual({
      '--color-accent': '#8a7aa8',
      '--color-accent-soft': '#b9a8d8',
      '--color-glow': '#9a86c8',
      '--color-dial-face': '#e9dcc0',
    })
  })

  it('puts the base colours back on a planet with no skin', () => {
    const base = DESIGN_TOKENS.colour
    expect(planetSkinStyleOf('palette.planet_9')).toEqual({
      '--color-accent': base.accent,
      '--color-accent-soft': base.accentSoft,
      '--color-glow': base.glow,
      '--color-dial-face': base.dialFace,
    })
  })

  it('writes only skinnable colours, never a limit', () => {
    const skinnable = DESIGN_TOKENS.skinnable.map(colourPropertyOf)
    expect(Object.keys(planetSkinStyleOf('palette.heat'))).toEqual(skinnable)
  })
})
