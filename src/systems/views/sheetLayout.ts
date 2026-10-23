/**
 * The shared sheet's layout rules (spec #678, ticket 686; docs/ui/design-system.md sections 6, 9
 * and 10): where the one base sheet sits, how its shutter moves and what its tab bar shows. On a
 * phone the sheet fills the screen; on desktop it docks beside the play view and narrows the stage
 * instead of covering it (GD lock, 21 Oct). Ticket 767 (GD lock, 23 Oct): it docks from
 * `layout.sheetDock.minScreenPx` (1280) up, a narrower desktop window taking the full sheet, and the
 * dock takes at most `maxSharePercent` (25%) of the play area, `widthPx` (400) at most. Presentation
 * only: nothing here is a command, a log line or part of the digest.
 */
import { DESIGN_TOKENS, type DesignTokens, type LayoutKind } from './designSystem'

/** `full` covers the stage (a phone's mode); `docked` sits beside the narrowed stage. */
export type SheetPlacement = 'full' | 'docked'

const PERCENT = 100

export interface SheetTransition {
  /** The brass shutter slides; with Reduce Motion it fades over the same time (section 6). */
  kind: 'shutter' | 'fade'
  ms: number
}

export interface SheetTabBar {
  tabIds: readonly string[]
  /** The tab the sheet shows: the one asked for, else the first; null with no tab to show. */
  activeTabId: string | null
  /** A lone tab is the sheet's title alone; the bar shows once there is a choice of two. */
  isShown: boolean
  /** More tabs than `layout.tabsMax` fit before the bar scrolls sideways. */
  isScrolling: boolean
}

export function sheetPlacementOf(
  kind: LayoutKind,
  screenWidthPx: number,
  tokens: DesignTokens = DESIGN_TOKENS,
): SheetPlacement {
  if (kind === 'phone') return 'full'
  return hasRoomToDock(screenWidthPx, tokens) ? 'docked' : 'full'
}

/** The dock's width in CSS px: `widthPx`, held to `maxSharePercent` of the stage it docks beside. */
export function sheetDockWidthOf(
  screenWidthPx: number,
  tokens: DesignTokens = DESIGN_TOKENS,
): number {
  const { widthPx, maxSharePercent } = tokens.layout.sheetDock
  return Math.min(widthPx, Math.floor((screenWidthPx * maxSharePercent) / PERCENT))
}

export function sheetTransitionOf(
  isMotionReduced: boolean,
  tokens: DesignTokens = DESIGN_TOKENS,
): SheetTransition {
  return { kind: isMotionReduced ? 'fade' : 'shutter', ms: tokens.motion.durationsMs.sheet }
}

export function sheetTabBarOf(
  tabIds: readonly string[],
  askedTabId: string | null,
  tokens: DesignTokens = DESIGN_TOKENS,
): SheetTabBar {
  return {
    tabIds,
    activeTabId: activeTabIdOf(tabIds, askedTabId),
    isShown: tabIds.length > 1,
    isScrolling: tabIds.length > tokens.layout.tabsMax,
  }
}

function hasRoomToDock(screenWidthPx: number, tokens: DesignTokens): boolean {
  return screenWidthPx >= tokens.layout.sheetDock.minScreenPx
}

function activeTabIdOf(tabIds: readonly string[], askedTabId: string | null): string | null {
  if (askedTabId !== null && tabIds.includes(askedTabId)) return askedTabId
  return tabIds[0] ?? null
}
