import { describe, expect, it } from 'vitest'
import { GLOBAL_SHEETS, isGlobalSheet, parseGlobalClassNames } from './globalSheetGuard'

// Vite-only glob lives here, in a test, never in the rule module it exercises.
const sheetSources = import.meta.glob('../**/*.css', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>

describe('parseGlobalClassNames', () => {
  it('reads selectors and not declaration bodies', () => {
    const names = parseGlobalClassNames('.panel { opacity: 0.5 }\n.slot.filled { color: red }')
    expect([...names].sort()).toEqual(['filled', 'panel', 'slot'])
  })

  it('ignores comments and element rules', () => {
    const css = '/* .old */\nbutton:hover:not(:disabled) { opacity: .35 }\n* { margin: 0 }'
    expect([...parseGlobalClassNames(css)]).toEqual([])
  })
})

describe('isGlobalSheet', () => {
  it('is every stylesheet but a module', () => {
    expect(isGlobalSheet('ui/kit/base.css')).toBe(true)
    expect(isGlobalSheet('ui/Hud.module.css')).toBe(false)
    expect(isGlobalSheet('ui/Hud.tsx')).toBe(false)
  })
})

describe('the page’s global stylesheets', () => {
  const relative = Object.entries(sheetSources).map(([path, css]) => [path.replace('../', ''), css])

  it('are only the token sheet and the page base', () => {
    const globals = relative.map(([path]) => path).filter(isGlobalSheet)
    expect(globals.sort()).toEqual([...GLOBAL_SHEETS].sort())
  })

  it('declare no class: every class lives in a module beside its component', () => {
    for (const [path, css] of relative.filter(([path]) => isGlobalSheet(path))) {
      expect([...parseGlobalClassNames(css)], path).toEqual([])
    }
  })
})
