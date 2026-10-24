import { createElement } from 'react'
import { renderToString } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { withRegistrations } from '../../registries/registrar'
import type { SliceDefinition } from '../../registries/sliceDefinition'
import { readSellBayModel, readShownBayPanelIds } from '../../store/screenReads'
import { RegistrationRefusedError } from '../../systems/registries/seal'
import type { LayoutKind } from '../../systems/views/designSystem'
import { UI_IDS } from '../ids'
import { bayPanelRowsWithoutKind, type BayPanelRow } from '../registries/bayPanels'
import { BayPanelPages } from './BayPanelList'
import { BAY_PANEL_UI_IDS } from './bayPanelIds'
import { SellBayView } from './SellBayView'

// The Sell bay's body panels (ticket 845, the TD ruling on #821 Q3): an ordered, data-driven list
// of rows drawn by their kind's view, with no merchant code in the kernel. A fake slice registers a
// merchant kind and one row per merchant; the e2e and screenshot cells are the example slice's.

const MERCHANT_KIND = 'bay-probe.merchant'

function MerchantProbe({ panelId }: { panelId: string }) {
  return createElement('span', { 'data-testid': 'bay-probe-merchant' }, panelId)
}

function merchantRow(at: number, overrides: Partial<BayPanelRow> = {}): BayPanelRow {
  return {
    panelId: `bay-probe.merchant-${at}`,
    bayId: 'sell',
    order: at,
    kind: MERCHANT_KIND,
    visibleWhen: () => true,
    ...overrides,
  }
}

function merchantSlice(rows: readonly BayPanelRow[]): SliceDefinition {
  return {
    id: 'bay-probe',
    register(r) {
      r.bayPanelKind({ id: MERCHANT_KIND, Panel: MerchantProbe })
      rows.forEach((row) => r.bayPanelRow(row))
    },
  }
}

const merchants = (count: number) => Array.from({ length: count }, (_, at) => merchantRow(at + 1))

function sellBayMarkupWith(slices: readonly SliceDefinition[]): string {
  const model = readSellBayModel()
  return withRegistrations(slices, () =>
    renderToString(createElement(SellBayView, { model, focusedId: '' })),
  )
}

function pagesMarkupOf(rows: readonly BayPanelRow[], layout: LayoutKind): string {
  const panelIds = rows.map((row) => row.panelId)
  return withRegistrations([merchantSlice(rows)], () =>
    renderToString(createElement(BayPanelPages, { panelIds, layout })),
  )
}

/** The merchants a markup draws, in drawing order. */
function drawnMerchantsOf(html: string): string[] {
  return [...html.matchAll(/data-bay-panel-id="([^"]+)"/g)].map((match) => match[1])
}

const testIdAt = (html: string, id: string) => html.indexOf(`data-testid="${id}"`)

describe('sell bay panel rows', () => {
  it('draws the bay exactly as before with no row', () => {
    const before = sellBayMarkupWith([])
    expect(testIdAt(before, BAY_PANEL_UI_IDS.list)).toBe(-1)
    expect(sellBayMarkupWith([merchantSlice([])])).toBe(before)
  })

  it('draws nothing for a row whose visibleWhen is false', () => {
    const hidden = merchantRow(1, { visibleWhen: () => false })
    expect(sellBayMarkupWith([merchantSlice([hidden])])).toBe(sellBayMarkupWith([]))
  })

  it("draws a merchant's panel after the bay's own rows", () => {
    const html = sellBayMarkupWith([merchantSlice(merchants(1))])
    expect(drawnMerchantsOf(html)).toEqual(['bay-probe.merchant-1'])
    expect(testIdAt(html, BAY_PANEL_UI_IDS.list)).toBeGreaterThan(
      testIdAt(html, UI_IDS.chargingRecharge),
    )
  })

  it('draws rows by order, then by panel id, whatever order they were registered in', () => {
    const rows = [merchantRow(3, { order: 1 }), merchantRow(2, { order: 5 }), merchantRow(1)]
    const shown = withRegistrations([merchantSlice(rows)], () => readShownBayPanelIds('sell'))
    expect(shown).toEqual(['bay-probe.merchant-1', 'bay-probe.merchant-3', 'bay-probe.merchant-2'])
  })

  it('keeps one merchant on one desktop page with no pager', () => {
    const html = pagesMarkupOf(merchants(1), 'desktop')
    expect(html).toContain('data-page-count="1"')
    expect(testIdAt(html, BAY_PANEL_UI_IDS.next)).toBe(-1)
  })

  it('pages five merchants on desktop, two at a time, with Previous and Next', () => {
    const html = pagesMarkupOf(merchants(5), 'desktop')
    expect(drawnMerchantsOf(html)).toEqual(['bay-probe.merchant-1', 'bay-probe.merchant-2'])
    expect(html).toContain('data-page-count="3"')
    expect(testIdAt(html, BAY_PANEL_UI_IDS.previous)).toBeGreaterThan(-1)
    expect(testIdAt(html, BAY_PANEL_UI_IDS.next)).toBeGreaterThan(-1)
  })

  it('draws all five merchants on a phone, for the bay to scroll, with no pager', () => {
    const html = pagesMarkupOf(merchants(5), 'phone')
    expect(drawnMerchantsOf(html)).toHaveLength(5)
    expect(testIdAt(html, BAY_PANEL_UI_IDS.next)).toBe(-1)
  })

  it('refuses a row on a bay whose body draws no panel rows', () => {
    const upgradeRow = merchantRow(1, { bayId: 'upgrade' })
    expect(() => withRegistrations([merchantSlice([upgradeRow])], () => null)).toThrow(
      RegistrationRefusedError,
    )
  })

  it("refuses a row whose panel id is not prefixed with the slice's id", () => {
    const stray = merchantRow(1, { panelId: 'merchant-1' })
    expect(() => withRegistrations([merchantSlice([stray])], () => null)).toThrow(
      RegistrationRefusedError,
    )
  })

  it('has every loaded row name a registered kind', () => {
    expect(bayPanelRowsWithoutKind()).toEqual([])
  })
})
