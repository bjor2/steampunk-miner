/**
 * What the UI screenshot suite fails on (spec #678, ticket 689): text that overflows its box or
 * its panel, a tap target under 44 px, the HUD over its coverage budget (12% on a phone, 8% on
 * desktop), and anything in the drill head's middle band; and text under the 14 px floor, which
 * the design's rule map gives this suite with the targets (docs/ui/design-system.md section 15).
 * The limits are the design tokens' own (`layout.tapTargetMinPx`, `type.minPx`). The coverage and the band come from the
 * #682 overlay's report (`ui.getHudCoverage()`), the same numbers the overlay prints; the touch
 * controls the report leaves out of the budget are still held out of the band. Geometry through
 * the DOM and `steampunkDebug`, never pixels.
 */
import type { Page } from '@playwright/test'
import { DESIGN_TOKENS } from '../../../src/systems/views/designSystem'
import { doBoxesOverlap } from '../../../src/systems/views/hudClearView'
import type { HudCoverageReport } from '../../../src/systems/views/hudCoverageReport'
import { hudBoxes, SLACK_PX } from '../hud/hudLayoutHelpers'

/** What a sheet shows out of place; every list is empty when it holds. */
export interface SheetFindings {
  overflow: string[]
  smallTargets: string[]
  smallTexts: string[]
}

/** A sheet's findings plus the HUD's own: the boxes in the middle band and the share over budget. */
export interface HudFindings extends SheetFindings {
  inBand: string[]
  overBudget: string[]
}

export const NO_SHEET_FINDINGS: SheetFindings = { overflow: [], smallTargets: [], smallTexts: [] }
export const NO_HUD_FINDINGS: HudFindings = { ...NO_SHEET_FINDINGS, inBand: [], overBudget: [] }

/** Where a sheet's findings are read: its root, and the parts of it that pan past its frame. */
export interface FindingsScope {
  rootSelector: string
  /** Test ids of maps or carousels that pan: their texts may leave the frame. */
  pannedTestIds: readonly string[]
}

/**
 * The hint chip cuts its one line with an ellipsis by design (#500: its card shows it whole), so
 * its text is not judged for overflow.
 */
const HUD_SCOPE: FindingsScope & { exemptSelector: string } = {
  rootSelector: '[data-hud]',
  pannedTestIds: [],
  exemptSelector: '[data-hud="hint"]',
}

/** The HUD in play: every `data-hud` box, every target on the page, the band and the budget. */
export async function hudFindingsOf(page: Page): Promise<HudFindings> {
  const report = await hudCoverageOf(page)
  return {
    overflow: await overflowsIn(page, HUD_SCOPE, HUD_SCOPE.exemptSelector),
    smallTargets: await smallTargetsIn(page, 'body'),
    smallTexts: await smallTextsIn(page, HUD_SCOPE.rootSelector),
    inBand: [...report.bandIntruderIds, ...(await controlsInBand(page, report))],
    overBudget: overBudgetOf(report),
  }
}

export async function sheetFindingsOf(page: Page, scope: FindingsScope): Promise<SheetFindings> {
  return {
    overflow: await overflowsIn(page, scope, null),
    smallTargets: await smallTargetsIn(page, scope.rootSelector),
    smallTexts: await smallTextsIn(page, scope.rootSelector),
  }
}

/** The overlay's report as `ui.getHudCoverage()` hands it over (ticket 682). */
export async function hudCoverageOf(page: Page): Promise<HudCoverageReport> {
  const result = await page.evaluate(() => window.steampunkDebug!.ui.getHudCoverage())
  if (!result.ok) throw new Error(result.problems.join('; '))
  return result.report
}

function overBudgetOf(report: HudCoverageReport): string[] {
  if (report.isMeasuredWithinBudget) return []
  return [`HUD covers ${report.measuredPercent}% of ${report.budgetPercent}% (${report.kind})`]
}

/** The touch controls the coverage budget leaves out are still never in the band. */
async function controlsInBand(page: Page, report: HudCoverageReport): Promise<string[]> {
  const controls = (await hudBoxes(page)).filter((box) => box.id === 'control')
  return controls
    .filter((box) => doBoxesOverlap(box, report.middleBand, SLACK_PX))
    .map((box) => `control:${box.testId ?? ''}`)
}

/**
 * The page scrolling sideways, a root leaving the screen, and every visible text of its own that
 * runs out of its root (sideways always; down only outside a scroll area, which scrolls it into
 * view) or is cut inside its own box. A title kept for assistive tech is clipped out of sight on
 * purpose and is not judged.
 */
function overflowsIn(
  page: Page,
  scope: FindingsScope,
  exemptSelector: string | null,
): Promise<string[]> {
  return page.evaluate(
    ({ rootSelector, pannedTestIds, exemptSelector, slack }) => {
      const findings: string[] = []
      const root = document.documentElement
      if (root.scrollWidth > innerWidth + slack)
        findings.push(`page scrolls sideways: ${root.scrollWidth} px in ${innerWidth} px`)
      const isShown = (element: Element) => {
        const rect = element.getBoundingClientRect()
        return (
          rect.width > 0 && rect.height > 0 && getComputedStyle(element).visibility !== 'hidden'
        )
      }
      const isWithin = (element: Element, selector: string) => element.closest(selector) !== null
      const isPanned = (element: Element) =>
        pannedTestIds.some((id) => isWithin(element, `[data-testid="${id}"]`))
      const hasOwnText = (element: Element) =>
        [...element.childNodes].some(
          (node) => node.nodeType === Node.TEXT_NODE && (node.textContent ?? '').trim() !== '',
        )
      const nameOf = (element: Element) =>
        element.getAttribute('data-testid') ??
        element.getAttribute('data-hud') ??
        (element.textContent ?? '').trim().slice(0, 30)
      const isCut = (element: HTMLElement) => {
        const style = getComputedStyle(element)
        const scrollsX = style.overflowX === 'auto' || style.overflowX === 'scroll'
        const scrollsY = style.overflowY === 'auto' || style.overflowY === 'scroll'
        const isBlock = element.clientWidth > 0
        const isCutX = !scrollsX && element.scrollWidth > element.clientWidth + slack
        const isCutY = !scrollsY && element.scrollHeight > element.clientHeight + slack
        return isBlock && (isCutX || isCutY)
      }
      for (const panel of document.querySelectorAll(rootSelector)) {
        if (!isShown(panel)) continue
        const frame = panel.getBoundingClientRect()
        const panelName = nameOf(panel)
        const isOffScreen =
          frame.left < -slack ||
          frame.top < -slack ||
          frame.right > innerWidth + slack ||
          frame.bottom > innerHeight + slack
        if (isOffScreen) findings.push(`${panelName} leaves the screen`)
        for (const element of panel.querySelectorAll('*')) {
          if (!hasOwnText(element) || !isShown(element) || isPanned(element)) continue
          if (exemptSelector !== null && isWithin(element, exemptSelector)) continue
          if (getComputedStyle(element).clipPath !== 'none') continue
          const rect = element.getBoundingClientRect()
          const isOutSideways = rect.left < frame.left - slack || rect.right > frame.right + slack
          const isOutDown =
            !isWithin(element, '[data-scroll-area]') &&
            (rect.top < frame.top - slack || rect.bottom > frame.bottom + slack)
          if (isOutSideways || isOutDown)
            findings.push(`${panelName}: "${nameOf(element)}" runs out`)
          else if (isCut(element as HTMLElement))
            findings.push(`${panelName}: "${nameOf(element)}" is cut`)
        }
      }
      return findings
    },
    { ...scope, exemptSelector, slack: SLACK_PX },
  )
}

/**
 * Every button, link, field, tab, slider and switch under the root that a tap can land on, under
 * 44 px either way (GD lock; `MIN_TARGET_PX`). A target scrolled away or under a sheet is not
 * reachable and not judged; an amount that reveals its exact value (`data-tap-exact`) is text, not
 * a control.
 */
function smallTargetsIn(page: Page, rootSelector: string): Promise<string[]> {
  return page.evaluate(
    ({ rootSelector, minTarget, slack }) => {
      const targetSelector =
        'button, a[href], input, select, textarea, [role="button"], [role="tab"], [role="slider"], [role="switch"]'
      const isReachable = (element: Element) => {
        const rect = element.getBoundingClientRect()
        const x = Math.min(Math.max((rect.left + rect.right) / 2, 0), innerWidth - 1)
        const y = Math.min(Math.max((rect.top + rect.bottom) / 2, 0), innerHeight - 1)
        const hit = document.elementFromPoint(x, y)
        return rect.width > 0 && rect.height > 0 && hit !== null && element.contains(hit)
      }
      const isSmall = (element: Element) => {
        const { width, height } = element.getBoundingClientRect()
        return width < minTarget - slack || height < minTarget - slack
      }
      const nameOf = (element: Element) => {
        const { width, height } = element.getBoundingClientRect()
        const name =
          element.getAttribute('data-testid') ??
          element.getAttribute('aria-label') ??
          (element.textContent ?? '').trim().slice(0, 30)
        return `${name} ${Math.round(width)}x${Math.round(height)}`
      }
      const targets = [...document.querySelectorAll(rootSelector)].flatMap((root) => [
        ...root.querySelectorAll(targetSelector),
      ])
      return [...new Set(targets)]
        .filter((element) => !element.matches('[data-tap-exact]'))
        .filter((element) => isReachable(element) && isSmall(element))
        .map(nameOf)
    },
    { rootSelector, minTarget: DESIGN_TOKENS.layout.tapTargetMinPx, slack: SLACK_PX },
  )
}

/**
 * Every visible text of its own under the root drawn smaller than the 14 px floor (GD lock,
 * `type.minPx`). A title kept for assistive tech is clipped out of sight and is not judged.
 */
function smallTextsIn(page: Page, rootSelector: string): Promise<string[]> {
  return page.evaluate(
    ({ rootSelector, minPx }) => {
      const hasOwnText = (element: Element) =>
        [...element.childNodes].some(
          (node) => node.nodeType === Node.TEXT_NODE && (node.textContent ?? '').trim() !== '',
        )
      const isShown = (element: Element) => {
        const rect = element.getBoundingClientRect()
        const style = getComputedStyle(element)
        return (
          rect.width > 0 &&
          rect.height > 0 &&
          style.visibility !== 'hidden' &&
          style.clipPath === 'none'
        )
      }
      const sizeOf = (element: Element) => parseFloat(getComputedStyle(element).fontSize)
      const texts = [...document.querySelectorAll(rootSelector)].flatMap((root) => [
        root,
        ...root.querySelectorAll('*'),
      ])
      return [...new Set(texts)]
        .filter((element) => hasOwnText(element) && isShown(element))
        .filter((element) => sizeOf(element) < minPx)
        .map(
          (element) => `"${(element.textContent ?? '').trim().slice(0, 30)}" ${sizeOf(element)} px`,
        )
    },
    { rootSelector, minPx: DESIGN_TOKENS.type.minPx },
  )
}
