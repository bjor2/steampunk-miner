/**
 * The Sell bay's slice panels in order and by page (ticket 845, the TD ruling on #821 Q3, HS 3): an
 * unbounded list of data rows, drawn after the bay's own rows. A phone shows every row in the bay's
 * one scroll area; desktop shows `layout.bayPanels.desktopPerPage` rows a page, and Previous and
 * Next turn the pages round, so the bay's own rows stay in view however many panels there are.
 * Presentation only: nothing here is a command, a log line or part of the digest.
 */
import { DESIGN_TOKENS, type DesignTokens, type LayoutKind } from './designSystem'

/** What the order reads of a row. */
export interface OrderedBayPanel {
  panelId: string
  order: number
}

export interface BayPanelPage {
  /** The rows the page draws, in order. */
  panelIds: readonly string[]
  /** The page drawn, wrapped into `0 .. pageCount - 1`. */
  pageIndex: number
  /** 1 on a phone, which scrolls instead, and for a list that fits one page. */
  pageCount: number
}

/** The rows in drawing order: by order, then by panel id, so equal orders never swap. */
export function bayPanelsInOrder<T extends OrderedBayPanel>(rows: readonly T[]): T[] {
  return [...rows].sort(byOrderThenPanelId)
}

/** The page `pageIndex` asks for on `layout`; an index past either end turns round. */
export function bayPanelPageOf(
  panelIds: readonly string[],
  layout: LayoutKind,
  pageIndex: number,
  tokens: DesignTokens = DESIGN_TOKENS,
): BayPanelPage {
  if (layout === 'phone') return { panelIds, pageIndex: 0, pageCount: 1 }
  return desktopPageOf(panelIds, pageIndex, tokens.layout.bayPanels.desktopPerPage)
}

function desktopPageOf(
  panelIds: readonly string[],
  pageIndex: number,
  perPage: number,
): BayPanelPage {
  const pageCount = Math.max(1, Math.ceil(panelIds.length / perPage))
  const wrapped = wrappedPageIndexOf(pageIndex, pageCount)
  const first = wrapped * perPage
  return { panelIds: panelIds.slice(first, first + perPage), pageIndex: wrapped, pageCount }
}

function wrappedPageIndexOf(pageIndex: number, pageCount: number): number {
  return ((pageIndex % pageCount) + pageCount) % pageCount
}

function byOrderThenPanelId(a: OrderedBayPanel, b: OrderedBayPanel): number {
  if (a.order !== b.order) return a.order - b.order
  return a.panelId < b.panelId ? -1 : a.panelId > b.panelId ? 1 : 0
}
