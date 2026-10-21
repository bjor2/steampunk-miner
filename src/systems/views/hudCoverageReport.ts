/**
 * What the HUD coverage overlay reports (spec #678 GD lock, ticket 682; docs/ui/design-system.md
 * section 9): the share of the screen the measured HUD boxes cover together, the share the
 * design's reserved boxes (the strip, the slot bar and the edge gauge, laid out from the tokens)
 * cover, both against the layout's budget (12% on a phone, 8% on desktop), the middle band and
 * which measured box enters it, and on a phone the top keep-out and the stick zone. The reserved
 * share is the layout the HUD rebuild (#684, #691) fills; the measured share is what is on screen
 * now. Pure geometry in CSS px; the overlay and `ui.getHudCoverage()` hand it measured rects.
 */
import { type DesignTokens, DESIGN_TOKENS, type LayoutKind } from './designSystem'
import { coveredAreaOf, doBoxesOverlap, type ScreenBox, type ScreenSize } from './hudClearView'
import {
  coverageBudgetOf,
  hudBudgetBoxesOf,
  middleBandOf,
  stickZoneOf,
  topKeepOutOf,
  type HudBudgetBoxes,
  type SafeInsets,
} from './hudCoverageBudget'

/** A drawn HUD box as the page measured it, with its `data-hud` id. */
export interface MeasuredHudBox extends ScreenBox {
  id: string
}

/** A measured box as the report hands it back: whether it enters the middle band. */
export interface ReportedHudBox extends MeasuredHudBox {
  isInBand: boolean
}

export interface HudCoverageReading {
  kind: LayoutKind
  screen: ScreenSize
  insets: SafeInsets
  measured: readonly MeasuredHudBox[]
}

export interface HudCoverageReport {
  kind: LayoutKind
  /** The measured boxes' union, percent of the screen to the hundredth. */
  measuredPercent: number
  /** The reserved boxes' union, percent of the screen to the hundredth. */
  reservedPercent: number
  budgetPercent: number
  isMeasuredWithinBudget: boolean
  isReservedWithinBudget: boolean
  middleBand: ScreenBox
  /** The ids of measured boxes that enter the middle band, in page order. */
  bandIntruderIds: string[]
  measured: ReportedHudBox[]
  reserved: HudBudgetBoxes
  /** Phone only: the top 15% where nothing takes a tap. */
  topKeepOut: ScreenBox | null
  /** Phone only: the floating stick's zone, which no HUD box may enter. */
  stickZone: ScreenBox | null
}

/** A box's place as the overlay draws it, CSS px from the window's top left. */
export interface BoxRect {
  left: number
  top: number
  width: number
  height: number
}

const PERCENT = 100
const HUNDREDTHS = 100

export function hudCoverageReportOf(
  reading: HudCoverageReading,
  tokens: DesignTokens = DESIGN_TOKENS,
): HudCoverageReport {
  const { kind, screen, insets } = reading
  const reserved = hudBudgetBoxesOf(kind, screen, insets, tokens)
  const middleBand = middleBandOf(screen, tokens)
  const budget = coverageBudgetOf(kind, tokens)
  const measuredShare = coveredShareOf(reading.measured, screen)
  const reservedShare = coveredShareOf(Object.values(reserved), screen)
  const measured = boxesMarkedInBand(reading.measured, middleBand)
  return {
    kind,
    measuredPercent: percentOf(measuredShare),
    reservedPercent: percentOf(reservedShare),
    budgetPercent: percentOf(budget),
    isMeasuredWithinBudget: measuredShare <= budget,
    isReservedWithinBudget: reservedShare <= budget,
    middleBand,
    bandIntruderIds: measured.filter((box) => box.isInBand).map((box) => box.id),
    measured,
    reserved,
    topKeepOut: kind === 'phone' ? topKeepOutOf(screen, tokens) : null,
    stickZone: kind === 'phone' ? stickZoneOf(screen, insets, tokens) : null,
  }
}

/** The safe insets as the safe area's box sits in the screen (the stage's pillarbox included). */
export function insetsOfSafeArea(safeArea: ScreenBox, screen: ScreenSize): SafeInsets {
  return {
    top: safeArea.top,
    right: screen.width - safeArea.right,
    bottom: screen.height - safeArea.bottom,
    left: safeArea.left,
  }
}

/** The overlay's one line: `HUD 23.4% / 12% · layout 11.66%`. */
export function coverageLineOf(report: HudCoverageReport): string {
  const { measuredPercent, budgetPercent, reservedPercent } = report
  return `HUD ${measuredPercent}% / ${budgetPercent}% · layout ${reservedPercent}%`
}

export function boxRectOf(box: ScreenBox): BoxRect {
  return { left: box.left, top: box.top, width: box.right - box.left, height: box.bottom - box.top }
}

function coveredShareOf(boxes: readonly ScreenBox[], screen: ScreenSize): number {
  return coveredAreaOf(boxes, screen) / (screen.width * screen.height)
}

/** To the hundredth of a percent; the budget is judged on the unrounded share. */
function percentOf(share: number): number {
  return Math.round(share * PERCENT * HUNDREDTHS) / HUNDREDTHS
}

function boxesMarkedInBand(
  boxes: readonly MeasuredHudBox[],
  middleBand: ScreenBox,
): ReportedHudBox[] {
  return boxes.map((box) => ({ ...box, isInBand: doBoxesOverlap(box, middleBand) }))
}
