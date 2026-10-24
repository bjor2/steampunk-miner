import { describe, expect, it } from 'vitest'
import { bayPanelPageOf, bayPanelsInOrder } from './bayPanelPages'
import { DESIGN_TOKENS } from './designSystem'

// The Sell bay's slice panels (ticket 845, TD ruling on #821 Q3): an unbounded ordered list that
// scrolls on a phone and pages on desktop, both layouts first-class (HS 3).

const merchantIds = (count: number) =>
  Array.from({ length: count }, (_, at) => `probe.merchant-${String(at + 1).padStart(4, '0')}`)

describe('bay panel order', () => {
  it('draws rows by order, then by panel id', () => {
    const rows = [
      { panelId: 'b.late', order: 20 },
      { panelId: 'b.tie', order: 10 },
      { panelId: 'a.tie', order: 10 },
    ]
    expect(bayPanelsInOrder(rows).map((row) => row.panelId)).toEqual(['a.tie', 'b.tie', 'b.late'])
  })
})

describe('bay panel pages', () => {
  it('shows every row on a phone, which scrolls instead of paging', () => {
    const ids = merchantIds(5)
    expect(bayPanelPageOf(ids, 'phone', 3)).toEqual({ panelIds: ids, pageIndex: 0, pageCount: 1 })
  })

  it('fits one merchant on a single desktop page', () => {
    expect(bayPanelPageOf(merchantIds(1), 'desktop', 0)).toEqual({
      panelIds: merchantIds(1),
      pageIndex: 0,
      pageCount: 1,
    })
  })

  it('pages five merchants two at a time on desktop', () => {
    const ids = merchantIds(5)
    expect(DESIGN_TOKENS.layout.bayPanels.desktopPerPage).toBe(2)
    expect(bayPanelPageOf(ids, 'desktop', 0).panelIds).toEqual(ids.slice(0, 2))
    expect(bayPanelPageOf(ids, 'desktop', 1).panelIds).toEqual(ids.slice(2, 4))
    expect(bayPanelPageOf(ids, 'desktop', 2)).toEqual({
      panelIds: ids.slice(4),
      pageIndex: 2,
      pageCount: 3,
    })
  })

  it('turns round past the last page and before the first', () => {
    const ids = merchantIds(5)
    expect(bayPanelPageOf(ids, 'desktop', 3).pageIndex).toBe(0)
    expect(bayPanelPageOf(ids, 'desktop', -1).pageIndex).toBe(2)
  })

  it('keeps a page in range when the list shrinks under it', () => {
    expect(bayPanelPageOf(merchantIds(2), 'desktop', 2)).toEqual({
      panelIds: merchantIds(2),
      pageIndex: 0,
      pageCount: 1,
    })
  })

  it('has no cap on the list: every row of a long one lands on exactly one page', () => {
    const ids = merchantIds(1001)
    const { pageCount } = bayPanelPageOf(ids, 'desktop', 0)
    const drawn = Array.from({ length: pageCount }, (_, page) =>
      bayPanelPageOf(ids, 'desktop', page),
    ).flatMap((page) => page.panelIds)
    expect(pageCount).toBe(501)
    expect(drawn).toEqual(ids)
  })

  it('draws an empty first page with no rows', () => {
    expect(bayPanelPageOf([], 'desktop', 0)).toEqual({ panelIds: [], pageIndex: 0, pageCount: 1 })
  })
})
