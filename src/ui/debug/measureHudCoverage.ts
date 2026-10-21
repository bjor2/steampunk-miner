/**
 * The HUD coverage as the page draws it now (ticket 682): every `data-hud` box but the touch
 * controls, the safe area's insets and the layout the shell fitted, handed to the pure report.
 * The touch buttons stay under #500's clear-view share, not the HUD budget (design section 9:
 * the Interact button is a touch control, not a HUD box). Null before the first fit.
 */
import { layoutKindOf } from '../../systems/views/designSystem'
import {
  hudCoverageReportOf,
  insetsOfSafeArea,
  type HudCoverageReading,
  type HudCoverageReport,
  type MeasuredHudBox,
} from '../../systems/views/hudCoverageReport'
import { HUD_BOX_ATTRIBUTE, HUD_BOX_IDS } from '../hud/hudBoxes'
import { boxOf, measuredBoxesOf } from '../hud/measuredBoxes'
import { DEVICE_UI_IDS } from '../stage/deviceIds'
import { readFittedScreen } from '../stage/screenFit'

const OUTSIDE_BUDGET_IDS: ReadonlySet<string> = new Set([HUD_BOX_IDS.control])

export function measureHudCoverage(): HudCoverageReport | null {
  const page = readPageLayout()
  return page === null ? null : hudCoverageReportOf({ ...page, measured: measuredBudgetBoxes() })
}

function readPageLayout(): Omit<HudCoverageReading, 'measured'> | null {
  const fitted = readFittedScreen()
  if (fitted === null) return null
  const safeArea = document.querySelector(`[data-testid="${DEVICE_UI_IDS.safeArea}"]`)
  if (safeArea === null) return null
  const screen = { width: window.innerWidth, height: window.innerHeight }
  return {
    kind: layoutKindOf(fitted.hudDensity),
    screen,
    insets: insetsOfSafeArea(boxOf(safeArea), screen),
  }
}

function measuredBudgetBoxes(): MeasuredHudBox[] {
  return measuredBoxesOf(`[${HUD_BOX_ATTRIBUTE}]`, HUD_BOX_ATTRIBUTE).filter(
    (box) => !OUTSIDE_BUDGET_IDS.has(box.id),
  )
}
