/**
 * The tool slot bar's layout (spec #678 HS kinds, ticket 691; docs/ui/design-system.md section 9):
 * which tool sits in which cell. On a phone the first 4 shown tools by position fill the thumb
 * cells and the rest wait in the overflow tray; on desktop cell n always holds position n (Digit n
 * presses it) and positions past 8 wait in the tray. The tray opens in place: the overflow cell
 * pages the cells through the waiting tools and back to the thumb cells, so an open tray never
 * leaves the bar's reserved box (the middle band and the stick zone stay clear). With no tool
 * shown there is no bar (#173 acceptance 3). Pure; the bar component draws what this returns.
 */
import type { ToolFace } from '../input/toolSlots'
import { DESIGN_TOKENS, type DesignTokens, type LayoutKind } from './designSystem'

/** A tool the bar shows now: its row, its fixed position and its face. */
export interface ShownTool<F extends ToolFace = ToolFace> {
  rowId: string
  position: number
  face: F
}

/** The overflow cell: the tray page on the cells (0 is the thumb cells) and how many pages wait. */
export interface TrayPaging {
  page: number
  pages: number
}

export interface ToolBarLayout {
  /** One entry per slot cell; null is an empty well. */
  cells: (ShownTool | null)[]
  /** Null while no tool waits in the tray. */
  tray: TrayPaging | null
}

export function toolBarLayoutOf(
  tools: readonly ShownTool[],
  kind: LayoutKind,
  page: number,
  tokens: DesignTokens = DESIGN_TOKENS,
): ToolBarLayout | null {
  if (tools.length === 0) return null
  const count = tokens.layout.toolSlots.count[kind]
  const { thumbs, tray } = splitAtThumbs(byPosition(tools), kind, count)
  const pages = Math.ceil(tray.length / count)
  const shownPage = page <= pages ? page : 0
  return {
    cells: shownPage === 0 ? thumbs : padTo(trayPageOf(tray, shownPage, count), count),
    tray: pages === 0 ? null : { page: shownPage, pages },
  }
}

/** The page the overflow cell turns to: the next tray page, then back to the thumb cells. */
export function nextTrayPageOf({ page, pages }: TrayPaging): number {
  return page >= pages ? 0 : page + 1
}

function byPosition(tools: readonly ShownTool[]): ShownTool[] {
  return [...tools].sort((a, b) => a.position - b.position)
}

function splitAtThumbs(
  sorted: readonly ShownTool[],
  kind: LayoutKind,
  count: number,
): { thumbs: (ShownTool | null)[]; tray: ShownTool[] } {
  if (kind === 'desktop') return splitAtFixedPositions(sorted, count)
  return { thumbs: padTo(sorted.slice(0, count), count), tray: sorted.slice(count) }
}

/** Desktop: cell n holds position n, so a number key always meets the same cell. */
function splitAtFixedPositions(sorted: readonly ShownTool[], count: number) {
  const cells = Array.from(
    { length: count },
    (_, index) => sorted.find((tool) => tool.position === index + 1) ?? null,
  )
  return { thumbs: cells, tray: sorted.filter((tool) => tool.position > count) }
}

function trayPageOf(tray: readonly ShownTool[], page: number, count: number): ShownTool[] {
  return tray.slice((page - 1) * count, page * count)
}

function padTo(tools: readonly (ShownTool | null)[], count: number): (ShownTool | null)[] {
  return Array.from({ length: count }, (_, index) => tools[index] ?? null)
}
