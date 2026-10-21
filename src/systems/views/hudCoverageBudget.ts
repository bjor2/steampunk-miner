/**
 * The HUD's coverage budget (spec #678 GD lock, ticket 679; docs/ui/design-system.md section 9):
 * the boxes the design reserves on a screen (the top strip, the tool slot bar and the edge gauge),
 * laid out from the design tokens, and the share of the screen they cover together, judged
 * against the budget: at most 12% on a phone and 8% on desktop. Also the two keep-outs: the
 * middle band, where the drill head sits, which no HUD box may enter, and the top keep-out, where
 * nothing on a phone takes a tap. Pure geometry in CSS pixels; the coverage overlay (#682) and
 * the screenshot suite (#689) measure the real boxes against the same numbers.
 */
import {
  CLUSTER_GAP_PX,
  INTERACT_BUTTON_PX,
  TOOL_BAR_OVER_CLUSTER_GAP_PX,
} from '../../constants/touch'
import { DESIGN_TOKENS, type DesignTokens, type LayoutKind } from './designSystem'
import { coveredAreaOf, doBoxesOverlap, type ScreenBox, type ScreenSize } from './hudClearView'

/** The device's safe-area insets, CSS px, as the shell mirrors them (ticket 483). */
export interface SafeInsets {
  top: number
  right: number
  bottom: number
  left: number
}

export const NO_INSETS: SafeInsets = { top: 0, right: 0, bottom: 0, left: 0 }

/** The boxes the design reserves; everything else drawn over the view is transient or an edge. */
export interface HudBudgetBoxes {
  strip: ScreenBox
  toolSlots: ScreenBox
  edgeGauge: ScreenBox
}

const PERCENT = 100

export function hudBudgetBoxesOf(
  kind: LayoutKind,
  screen: ScreenSize,
  insets: SafeInsets = NO_INSETS,
  tokens: DesignTokens = DESIGN_TOKENS,
): HudBudgetBoxes {
  return {
    strip: stripBoxOf(kind, screen, insets, tokens),
    toolSlots: toolSlotBoxOf(kind, screen, insets, tokens),
    edgeGauge: edgeGaugeBoxOf(screen, insets, tokens),
  }
}

/** The share of the screen the reserved boxes cover together, 0 to 1. */
export function hudCoverageShareOf(
  kind: LayoutKind,
  screen: ScreenSize,
  insets: SafeInsets = NO_INSETS,
  tokens: DesignTokens = DESIGN_TOKENS,
): number {
  const boxes = Object.values(hudBudgetBoxesOf(kind, screen, insets, tokens))
  return coveredAreaOf(boxes, screen) / (screen.width * screen.height)
}

/** The budget for this layout as a share, 0 to 1. */
export function coverageBudgetOf(kind: LayoutKind, tokens: DesignTokens = DESIGN_TOKENS): number {
  return tokens.layout.coverageMaxPercent[kind] / PERCENT
}

export function isWithinCoverageBudget(
  kind: LayoutKind,
  screen: ScreenSize,
  insets: SafeInsets = NO_INSETS,
  tokens: DesignTokens = DESIGN_TOKENS,
): boolean {
  return hudCoverageShareOf(kind, screen, insets, tokens) <= coverageBudgetOf(kind, tokens)
}

/** The rows where the drill head sits, between the edge lanes: no HUD box enters it. */
export function middleBandOf(screen: ScreenSize, tokens: DesignTokens = DESIGN_TOKENS): ScreenBox {
  const { middleBand, edgeLanePx } = tokens.layout
  return {
    left: edgeLanePx,
    top: (screen.height * middleBand.topPercent) / PERCENT,
    right: screen.width - edgeLanePx,
    bottom: (screen.height * middleBand.bottomPercent) / PERCENT,
  }
}

export function isOutsideMiddleBand(
  box: ScreenBox,
  screen: ScreenSize,
  tokens: DesignTokens = DESIGN_TOKENS,
): boolean {
  return !doBoxesOverlap(box, middleBandOf(screen, tokens))
}

/** The top of a phone screen where nothing takes a tap (GD lock: the top 15%). */
export function topKeepOutOf(screen: ScreenSize, tokens: DesignTokens = DESIGN_TOKENS): ScreenBox {
  const bottom = (screen.height * tokens.layout.topKeepOutPercent) / PERCENT
  return { left: 0, top: 0, right: screen.width, bottom }
}

/** The floating stick's zone (#485): the thumb's side of the screen, its lower share. */
export function stickZoneOf(
  screen: ScreenSize,
  insets: SafeInsets = NO_INSETS,
  tokens: DesignTokens = DESIGN_TOKENS,
): ScreenBox {
  const { stickZoneWidthPercent, thumbZoneHeightPercent } = tokens.layout
  return {
    left: insets.left,
    top: screen.height - (screen.height * thumbZoneHeightPercent) / PERCENT,
    right: insets.left + (screen.width * stickZoneWidthPercent) / PERCENT,
    bottom: screen.height - insets.bottom,
  }
}

function stripBoxOf(
  kind: LayoutKind,
  screen: ScreenSize,
  insets: SafeInsets,
  tokens: DesignTokens,
): ScreenBox {
  const { strip } = tokens.layout
  const room = screen.width - insets.left - insets.right
  const width = Math.min(room, strip.maxWidthPx[kind])
  const left = insets.left + (room - width) / 2
  return { left, top: insets.top, right: left + width, bottom: insets.top + strip.heightPx[kind] }
}

/**
 * The slot cells plus the overflow tray and the gear button, a grid in the thumb's corner. On a
 * phone the touch cluster keeps the corner (G&V ruling on #691): held upright the bar stands on
 * the cluster's one row, held sideways it sits left of Interact, the cluster's foot.
 */
function toolSlotBoxOf(
  kind: LayoutKind,
  screen: ScreenSize,
  insets: SafeInsets,
  tokens: DesignTokens,
): ScreenBox {
  const { toolSlots, marginPx } = tokens.layout
  const cells = toolSlots.count[kind] + (toolSlots.overflow[kind] ? 1 : 0) + 1
  const columns = Math.min(cells, slotColumnsOf(kind, screen, tokens))
  const rows = Math.ceil(cells / columns)
  const cell = toolSlots.cellPx[kind]
  const width = columns * cell + (columns - 1) * toolSlots.gapPx
  const height = rows * cell + (rows - 1) * toolSlots.gapPx
  const lift = clusterClearanceOf(kind, screen)
  const right = screen.width - insets.right - marginPx - lift.right
  const bottom = screen.height - insets.bottom - marginPx - lift.bottom
  return { left: right - width, top: bottom - height, right, bottom }
}

/** How far the cluster pushes the bar off the corner: up when held upright, left sideways. */
function clusterClearanceOf(
  kind: LayoutKind,
  screen: ScreenSize,
): { right: number; bottom: number } {
  if (kind === 'desktop') return { right: 0, bottom: 0 }
  if (isUpright(screen))
    return { right: 0, bottom: INTERACT_BUTTON_PX + TOOL_BAR_OVER_CLUSTER_GAP_PX }
  return { right: INTERACT_BUTTON_PX + CLUSTER_GAP_PX, bottom: 0 }
}

function isUpright(screen: ScreenSize): boolean {
  return screen.height > screen.width
}

/** A phone held upright stacks the cells in a grid; sideways, and on desktop, they make one row. */
function slotColumnsOf(kind: LayoutKind, screen: ScreenSize, tokens: DesignTokens): number {
  const { columns } = tokens.layout.toolSlots
  if (kind === 'desktop') return columns.desktop
  return isUpright(screen) ? columns.phonePortrait : columns.phoneLandscape
}

/** A thin gauge in the right edge lane, spanning the middle band's rows. */
function edgeGaugeBoxOf(screen: ScreenSize, insets: SafeInsets, tokens: DesignTokens): ScreenBox {
  const { edgeGauge, edgeLanePx } = tokens.layout
  const band = middleBandOf(screen, tokens)
  const right = screen.width - insets.right - (edgeLanePx - edgeGauge.widthPx) / 2
  return { left: right - edgeGauge.widthPx, top: band.top, right, bottom: band.bottom }
}
