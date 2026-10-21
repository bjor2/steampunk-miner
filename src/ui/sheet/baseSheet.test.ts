import { readFileSync } from 'node:fs'
import { createElement } from 'react'
import { renderToString } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createMemorySink } from '../../logging/eventSink'
import { createRunLog, installRunLog, uninstallRunLog } from '../../logging/runLog'
import { withRegistrations } from '../../registries/registrar'
import type { SliceDefinition } from '../../registries/sliceDefinition'
import { resetGameStore } from '../../store/gameStore'
import { sheetTabBarOf, sheetTransitionOf } from '../../systems/views/sheetLayout'
import { forgetUiTexts, registeredUiTexts } from '../../systems/views/uiText'
import { uiTextProblemsOf } from '../../systems/views/uiTextBudget'
import { Sheet } from '../kit/Sheet'
import { SheetCard, SheetCardView, type SheetCardText } from '../kit/SheetCard'
import type { SheetTab } from '../registries/sheetTabs'
import { BaseSheet, BaseSheetView } from './BaseSheet'
import { SHEET_UI_IDS } from './sheetIds'
import type { SheetShutter } from './useSheetShutter'

// The shared sheet (spec #678, ticket 686) rendered on the server (no DOM): its texts and data-*
// hooks are the contract, never markup shape (docs/TESTING_INSTRUCTIONS.md section 2). The style
// sheets are read as text for the rules only a stylesheet keeps: 44 px targets, the 14 px floor.
// A server render sees the store's first state, so the views take the store's values as props.

const DRILL: SheetCardText = {
  id: 'sheet-probe.drill',
  title: 'Drill power',
  line: 'Cuts harder rock and every band a little faster.',
}

function ProbeCards() {
  return createElement(SheetCard, { text: DRILL, onAct: () => undefined, figure: '1.2k' })
}

const tabOf = (id: string, title: string, order: number): SheetTab => ({
  id,
  title,
  order,
  isShownOn: () => true,
  Panel: ProbeCards,
})

const PROBE: SliceDefinition = {
  id: 'sheet-probe',
  register: (r) => {
    r.sheetTab(tabOf('sheet-probe.outfitter', 'Outfitter', 1))
    r.sheetTab(tabOf('sheet-probe.ledger', 'Ledger', 2))
  },
}

const LONE: SliceDefinition = {
  id: 'sheet-probe',
  register: (r) => r.sheetTab(tabOf('sheet-probe.hold', 'Hold', 1)),
}

const PROBE_TABS = ['sheet-probe.outfitter', 'sheet-probe.ledger']

const openingOn = (tabId: string): SheetShutter => ({
  tabId,
  phase: 'opening',
  transition: sheetTransitionOf(false),
})

/** The base sheet as the store would draw it at `placement` with `tabId` open. */
function sheetHtml(slice: SliceDefinition, tabId: string, shownTabIds: readonly string[]) {
  return withRegistrations([slice], () =>
    renderToString(
      createElement(BaseSheetView, {
        placement: 'full',
        shutter: openingOn(tabId),
        shownTabIds,
        onSelectTab: () => undefined,
        onClose: () => undefined,
      }),
    ),
  )
}

function textOf(html: string): string {
  return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ')
}

function sheetOf(path: string): string {
  return readFileSync(new URL(path, import.meta.url), 'utf8')
}

/** Every value a declaration of `property` takes in a stylesheet. */
function valuesOf(css: string, property: string): string[] {
  return [...css.matchAll(new RegExp(`(?:^|[;{\\s])${property}:\\s*([^;]+);`, 'g'))].map((match) =>
    match[1].trim(),
  )
}

beforeEach(() => {
  installRunLog(
    createRunLog({ runId: 'run_test', sink: createMemorySink(), secondsSinceStart: () => 0 }),
  )
  resetGameStore()
  forgetUiTexts()
})

afterEach(() => uninstallRunLog())

describe('base sheet', () => {
  it('draws nothing while shut', () => {
    const html = withRegistrations([PROBE], () =>
      renderToString(createElement(BaseSheet, { at: 'full' })),
    )
    expect(html).toBe('')
  })

  it('opens on the asked tab with its title, its content, the tab bar and Close', () => {
    const html = sheetHtml(PROBE, 'sheet-probe.ledger', PROBE_TABS)
    expect(html).toContain(`data-testid="${SHEET_UI_IDS.baseSheet}"`)
    expect(html).toContain('data-placement="full"')
    expect(html).toContain('aria-label="Ledger"')
    expect(html).toContain('data-sheet-tab="sheet-probe.outfitter"')
    expect(html).toMatch(/aria-selected="true"[^>]*data-sheet-tab="sheet-probe.ledger"/)
    expect(html).toContain('data-sheet-close')
    expect(html).toContain('data-sheet-card="sheet-probe.drill"')
    expect(html).toContain('data-scroll-area')
  })

  it('lays the tab bar in the shared scroll area sideways, the one place a row may scroll', () => {
    const html = sheetHtml(PROBE, 'sheet-probe.ledger', PROBE_TABS)
    expect(html).toMatch(/data-scroll-area="true" data-axis="x"[^]*data-sheet-tabs/)
    expect(html).toContain('data-axis="y"')
  })

  it('shows the first shown tab when the asked one is off the bar', () => {
    const html = sheetHtml(PROBE, 'sheet-probe.ledger', ['sheet-probe.outfitter'])
    expect(html).toContain('aria-label="Outfitter"')
  })

  it('leaves the tab bar out with a lone tab, the title naming it', () => {
    const html = sheetHtml(LONE, 'sheet-probe.hold', ['sheet-probe.hold'])
    expect(html).toContain('aria-label="Hold"')
    expect(html).not.toContain('data-sheet-tabs')
    expect(html).toContain('data-sheet-close')
  })

  it('draws nothing when no tab is shown', () => {
    expect(sheetHtml(LONE, 'sheet-probe.hold', [])).toBe('')
  })

  it('marks the shutter and its kind, a fade under Reduce Motion', () => {
    const frame = (isMotionReduced: boolean) =>
      renderToString(
        createElement(Sheet, {
          placement: 'docked',
          phase: 'opening',
          transition: sheetTransitionOf(isMotionReduced),
          title: 'Outfitter',
          tabs: [],
          tabBar: sheetTabBarOf([], null),
          onSelectTab: () => undefined,
          onClose: () => undefined,
          children: null,
        }),
      )
    expect(frame(false)).toContain('data-transition-kind="shutter"')
    expect(frame(true)).toContain('data-transition-kind="fade"')
    expect(frame(false)).toContain('data-transition="opening"')
    expect(frame(false)).toContain('--sheet-shutter:200ms')
  })
})

describe('sheet card', () => {
  it('shows its title and figure, with its line folded until revealed', () => {
    const html = renderToString(createElement(ProbeCards))
    expect(textOf(html)).toContain('Drill power')
    expect(textOf(html)).toContain('1.2k')
    expect(html).toContain('data-sheet-card-line')
    expect(textOf(html)).toContain(DRILL.line)
    expect(html).not.toContain('data-revealed')
  })

  it("shows its line once a finger's first tap revealed it", () => {
    const card = (isRevealed: boolean) =>
      renderToString(
        createElement(SheetCardView, {
          text: DRILL,
          isRevealed,
          onPointerDown: () => undefined,
          onPress: () => undefined,
        }),
      )
    expect(card(true)).toContain('data-revealed')
    expect(card(false)).not.toContain('data-revealed')
  })

  it('records its title and line, held to the copy budgets', () => {
    renderToString(createElement(ProbeCards))
    const [recorded] = registeredUiTexts()
    expect(recorded).toMatchObject({ id: DRILL.id, title: DRILL.title, oneLine: DRILL.line })
    expect(uiTextProblemsOf(recorded)).toEqual([])
  })
})

describe('sheet styles', () => {
  const sheets = [
    sheetOf('../kit/Sheet.module.css'),
    sheetOf('../kit/SheetCard.module.css'),
    sheetOf('../kit/SheetTabBar.module.css'),
  ]

  it('keeps every text at a type token, none under the 14 px floor', () => {
    const sizes = sheets.flatMap((css) => valuesOf(css, 'font-size'))
    expect(sizes.length).toBeGreaterThan(0)
    for (const size of sizes) expect(size).toMatch(/^var\(--type-(label|body|title)\)$/)
  })

  it('makes the card, every tab and Close at least the 44 px target', () => {
    const [sheet, card, tabBar] = sheets
    expect(valuesOf(card, 'min-height')).toContain('var(--tap-target-min)')
    expect(valuesOf(tabBar, 'min-height')).toContain('var(--tap-target-min)')
    expect(valuesOf(tabBar, 'min-width')).toContain('var(--tap-target-min)')
    expect(valuesOf(sheet, 'min-height')).toContain('var(--tap-target-min)')
    expect(valuesOf(sheet, 'min-width')).toContain('var(--tap-target-min)')
  })

  it('times every transition from the motion tokens, never a literal', () => {
    const timed = sheets.flatMap((css) => valuesOf(css, 'transition'))
    for (const value of timed) expect(value).not.toMatch(/\d+m?s/)
  })
})
