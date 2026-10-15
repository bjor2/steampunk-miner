import { readFileSync } from 'node:fs'
import { createElement, type ReactElement } from 'react'
import { renderToString } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createMemorySink } from '../../logging/eventSink'
import { createRunLog, installRunLog, uninstallRunLog } from '../../logging/runLog'
import { resetGameStore } from '../../store/gameStore'
import { readSettingsModel } from '../../store/screenReads'
import { forgetUiTexts, registeredUiTexts, type UiText } from '../../systems/views/uiText'
import { uiTextProblemsOf } from '../../systems/views/uiTextBudget'
import { SettingsView } from '../settings/SettingsView'
import { Panel } from './Panel'
import { ScrollArea } from './ScrollArea'
import { TitleOneLine } from './TitleOneLine'
import { Tooltip } from './Tooltip'

// Spec #422 (build #423): the shared parts rendered on the server (no DOM) carry their texts and
// data-* hooks, and register what they draw. Texts and hooks are the contract, never markup shape
// (docs/TESTING_INSTRUCTIONS.md section 2). The sheets are read as text for the design rules only
// a stylesheet can keep: no native scrollbar, a rail that overlays instead of pushing, the floor.

/** A kit sheet as text: the design rules below live in declarations, not in the DOM. */
function sheetOf(name: string): string {
  return readFileSync(new URL(`./${name}`, import.meta.url), 'utf8')
}

const FOAM: UiText = {
  id: 'demo.foam',
  title: 'Stabiliser foam',
  oneLine: 'Sets foam in a forward cone; the rock hardens and holds.',
  tooltipLines: ['A grey slurry from the boiler.', 'Cured foam keeps its hardness.'],
}

function textOf(html: string): string {
  return html.replace(/<[^>]*>/g, '').replace(/&#x27;/g, "'")
}

beforeEach(() => {
  installRunLog(
    createRunLog({ runId: 'run_test', sink: createMemorySink(), secondsSinceStart: () => 0 }),
  )
  resetGameStore()
  forgetUiTexts()
})

afterEach(() => uninstallRunLog())

describe('Title+OneLine element', () => {
  it('shows the title, the one line, each fact as an icon plus a value, and why it is locked', () => {
    const html = renderToString(
      createElement(TitleOneLine, {
        text: FOAM,
        iconId: 'icon-panel-shop',
        facts: [{ iconId: 'icon-hud-money', text: '1.2k', exact: '1234' }],
        lockReason: 'Needs: Deep bore',
      }),
    )
    const text = textOf(html)
    expect(text).toContain('Stabiliser foam')
    expect(text).toContain('Sets foam in a forward cone; the rock hardens and holds.')
    expect(html).toContain('data-testid="icon-hud-money"')
    expect(html).toContain('data-exact="1234"')
    expect(text).toContain('1.2k')
    expect(html).toContain('data-lock-reason')
    expect(text).toContain('Needs: Deep bore')
    expect(html).toContain('data-ui-text="demo.foam"')
    expect(html).toContain('data-locked')
  })

  it('records the text it draws, so the budget test reads the screen as shown', () => {
    renderToString(createElement(TitleOneLine, { text: FOAM }))
    expect(registeredUiTexts()).toEqual([FOAM])
  })

  it('keeps its tooltip in the markup, hidden, with the lines under the element’s id', () => {
    const html = renderToString(createElement(TitleOneLine, { text: FOAM }))
    expect(html).toContain('role="tooltip"')
    expect(html).toContain('data-tooltip="demo.foam"')
    expect(html).toMatch(/<div role="tooltip"[^>]*hidden/)
    expect(textOf(html)).toContain('A grey slurry from the boiler.')
  })

  it('draws no tooltip and no lock line for an open element with no tooltip lines', () => {
    const html = renderToString(
      createElement(TitleOneLine, { text: { ...FOAM, tooltipLines: [] } }),
    )
    expect(html).not.toContain('role="tooltip"')
    expect(html).not.toContain('data-lock-reason')
    expect(html).not.toContain('data-locked')
  })
})

describe('brass tooltip', () => {
  it('draws its child alone when there is nothing to say', () => {
    const html = renderToString(createElement(Tooltip, { id: 'x', lines: [], children: 'Sell' }))
    expect(html).not.toContain('role="tooltip"')
    expect(textOf(html)).toBe('Sell')
  })

  it('draws its child with a hidden plate of the lines otherwise', () => {
    const html = renderToString(
      createElement(Tooltip, { id: 'x', lines: ['One.', 'Two.'], children: 'Sell' }),
    )
    expect(html).toContain('data-tooltip="x"')
    expect(textOf(html)).toBe('SellOne.Two.')
  })
})

describe('panel with a heading', () => {
  it('draws the title as the shared element under the heading’s id, within budget', () => {
    const html = renderToString(
      createElement(Panel, {
        title: 'Hold',
        heading: { id: 'demo.hold', oneLine: 'Ore aboard and its value.', tooltipLines: [] },
        children: 'rows',
      }),
    )
    expect(html).toContain('data-ui-text="demo.hold"')
    expect(textOf(html)).toContain('Hold')
    expect(registeredUiTexts().map((text) => text.id)).toEqual(['demo.hold'])
    expect(registeredUiTexts().flatMap(uiTextProblemsOf)).toEqual([])
  })

  it('draws a plain title as before without one', () => {
    const html = renderToString(createElement(Panel, { title: 'Hold', children: 'rows' }))
    expect(html).not.toContain('data-ui-text')
    expect(registeredUiTexts()).toEqual([])
  })
})

describe('settings panel as the example element', () => {
  it('registers its header within the text budget and holds its rows in the scroll area', () => {
    const html = renderToString(settingsView())
    expect(html).toContain('data-ui-text="settings-panel"')
    expect(html).toContain('data-scroll-area')
    expect(registeredUiTexts().map((text) => text.id)).toEqual(['settings-panel'])
    expect(registeredUiTexts().flatMap(uiTextProblemsOf)).toEqual([])
  })
})

describe('steampunk scroll area', () => {
  it('draws its content and the rail’s thumb', () => {
    const html = renderToString(
      createElement(ScrollArea, { testId: 'demo-scroll', children: 'a long list' }),
    )
    expect(html).toContain('data-testid="demo-scroll"')
    expect(textOf(html)).toBe('a long list')
  })

  it('hides the native scrollbar on every engine and overlays the rail, so nothing shifts', () => {
    const css = sheetOf('ScrollArea.module.css')
    expect(css).toMatch(/scrollbar-width:\s*none/)
    expect(css).toMatch(/::-webkit-scrollbar\s*\{[^}]*display:\s*none/)
    expect(css).toMatch(/\.rail\s*\{[^}]*position:\s*absolute/)
  })

  it('keeps the rail hidden until a scroll wakes it, and fades it out through a transition', () => {
    const css = sheetOf('ScrollArea.module.css')
    expect(css).toMatch(/\.rail\s*\{[^}]*opacity:\s*0/)
    expect(css).toMatch(/\.rail\s*\{[^}]*transition:\s*opacity/)
    expect(css).toMatch(/\[data-awake\]\s*\.rail/)
  })
})

describe('the readable floor', () => {
  it('is one minimum text size and one text colour in the token sheet', () => {
    const css = sheetOf('tokens.css')
    expect(css).toMatch(/--text-min:\s*0\.9375rem/)
    expect(css).toMatch(/--color-text:\s*#f3ead8/)
  })
})

function settingsView(): ReactElement {
  return createElement(SettingsView, { model: readSettingsModel(), focusedId: '' })
}
