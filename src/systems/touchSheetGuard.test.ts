import { readdirSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  cssRulesOf,
  missingRootTouchDeclarationsOf,
  stickyHoverSelectorsOf,
  viewportHeightsWithoutTwinOf,
} from './touchSheetGuard'

// Read from disk: a `?raw` glob hands back the module object of a sheet a slice already imported.
const SRC_DIR = new URL('../', import.meta.url)
const ROOT_SHEET = 'src/ui/kit/base.css'

/** Every sheet under src, by repo path. */
function readSheets(): { path: string; css: string }[] {
  return readdirSync(SRC_DIR, { recursive: true, encoding: 'utf8' })
    .filter((path) => path.endsWith('.css'))
    .map((path) => ({ path: `src/${path}`, css: readFileSync(new URL(path, SRC_DIR), 'utf8') }))
}

describe('cssRulesOf', () => {
  it('keeps each rule’s at-rules and declarations, and skips comments', () => {
    const css = '/* .old:hover {} */ @media (hover: hover) { .a:hover { color: red; opacity: .5 } }'
    expect(cssRulesOf(css)).toEqual([
      {
        selector: '.a:hover',
        atRules: ['@media (hover: hover)'],
        declarations: [
          { property: 'color', value: 'red' },
          { property: 'opacity', value: '.5' },
        ],
      },
    ])
  })
})

describe('stickyHoverSelectorsOf', () => {
  it('refuses a hover style outside a (hover: hover) media block', () => {
    const rules = cssRulesOf('.a:hover:not(:disabled) { color: red }')
    expect(stickyHoverSelectorsOf(rules)).toEqual(['.a:hover:not(:disabled)'])
  })

  it('accepts a hover style inside one, however the query is spaced', () => {
    const rules = cssRulesOf('@media (hover:hover) and (pointer: fine) { .a:hover { color: red } }')
    expect(stickyHoverSelectorsOf(rules)).toEqual([])
  })

  it('refuses a hover style inside some other media block', () => {
    const rules = cssRulesOf('@media (max-height: 600px) { .a:hover { color: red } }')
    expect(stickyHoverSelectorsOf(rules)).toEqual(['.a:hover'])
  })
})

describe('viewportHeightsWithoutTwinOf', () => {
  it('refuses a vh length with no dvh twin', () => {
    expect(viewportHeightsWithoutTwinOf(cssRulesOf('.a { max-height: 70vh }'))).toEqual([
      '.a { max-height }',
    ])
  })

  it('accepts a vh fallback followed by its dvh twin in the same rule', () => {
    const rules = cssRulesOf('.a { max-height: 70vh; max-height: 70dvh }')
    expect(viewportHeightsWithoutTwinOf(rules)).toEqual([])
  })

  it('accepts a twin in an @supports block for the same selector', () => {
    const css =
      '.a { --size: calc(24 / 1080 * 100vh) } @supports (height: 1dvh) { .a { --size: calc(24 / 1080 * 100dvh) } }'
    expect(viewportHeightsWithoutTwinOf(cssRulesOf(css))).toEqual([])
  })

  it('never reads dvh, svh or vw as vh', () => {
    const rules = cssRulesOf('.a { height: 50dvh; min-height: 10svh; width: 90vw }')
    expect(viewportHeightsWithoutTwinOf(rules)).toEqual([])
  })
})

describe('missingRootTouchDeclarationsOf', () => {
  it('lists every root touch declaration a sheet without an html, body rule lacks', () => {
    expect(missingRootTouchDeclarationsOf(cssRulesOf('button { color: red }'))).toHaveLength(5)
  })

  it('accepts them on a rule naming html and body among others', () => {
    const css = `html, body, #root {
      overscroll-behavior: none; touch-action: manipulation; -webkit-touch-callout: none;
      -webkit-tap-highlight-color: transparent; user-select: none }`
    expect(missingRootTouchDeclarationsOf(cssRulesOf(css))).toEqual([])
  })
})

describe('the game’s stylesheets on a touch screen', () => {
  const sheets = readSheets().map((sheet) => ({ path: sheet.path, rules: cssRulesOf(sheet.css) }))

  it('keep every hover style inside (hover: hover), so none sticks after a tap', () => {
    for (const sheet of sheets) expect(stickyHoverSelectorsOf(sheet.rules), sheet.path).toEqual([])
  })

  it('give every vh length a dvh twin, so the URL bar never jumps the layout', () => {
    for (const sheet of sheets)
      expect(viewportHeightsWithoutTwinOf(sheet.rules), sheet.path).toEqual([])
  })

  it('turn off pull-to-refresh, double-tap zoom, the callout, the tap flash and selection at the root', () => {
    const root = sheets.find((sheet) => sheet.path === ROOT_SHEET)
    expect(root, ROOT_SHEET).toBeDefined()
    expect(missingRootTouchDeclarationsOf(root?.rules ?? [])).toEqual([])
  })
})
