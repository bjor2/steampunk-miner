/**
 * The HUD coverage overlay and the layout tokens (spec #678, ticket 682). On #689's four cells the
 * root carries the design's `data-layout` and its tokens (strip height, slot cell), the overlay
 * switched on through `ui.showHudCoverage(true)` draws the middle band where the design puts it,
 * prints the report `ui.getHudCoverage()` returns, and reports the reserved layout within the
 * budget: 12% on a phone, 8% on desktop. The measured share of today's HUD is logged as a
 * `hud-coverage` annotation, not asserted: the strip rebuild (#684) brings it under the budget and
 * the screenshot suite (#689) asserts it. Geometry through the DOM and `steampunkDebug` only.
 */
import { expect, test, type Page } from '@playwright/test'
import { middleBandOf } from '../../../src/systems/views/hudCoverageBudget'
import type { HudCoverageReport } from '../../../src/systems/views/hudCoverageReport'
import { openGame, SLACK_PX, type HudLayoutCell } from './hudLayoutHelpers'

interface CoverageCell extends HudLayoutCell {
  layout: 'phone' | 'desktop'
  budgetPercent: number
  stripHeight: string
  slotCell: string
}

const PHONE = { layout: 'phone', budgetPercent: 12, stripHeight: '36px', slotCell: '44px' } as const
const DESKTOP = {
  layout: 'desktop',
  budgetPercent: 8,
  stripHeight: '44px',
  slotCell: '48px',
} as const

const CELLS: readonly CoverageCell[] = [
  {
    name: 'phone-360x640',
    viewport: { width: 360, height: 640 },
    isTouch: true,
    isTvMode: false,
    floor: null,
    ...PHONE,
  },
  {
    name: 'phone-390x844',
    viewport: { width: 390, height: 844 },
    isTouch: true,
    isTvMode: false,
    floor: null,
    ...PHONE,
  },
  {
    name: 'desktop-1280x800',
    viewport: { width: 1280, height: 800 },
    isTouch: false,
    isTvMode: false,
    floor: null,
    ...DESKTOP,
  },
  {
    name: 'desktop-1440x900',
    viewport: { width: 1440, height: 900 },
    isTouch: false,
    isTvMode: false,
    floor: null,
    ...DESKTOP,
  },
]

/** Software WebGL on a loaded box is slow; this is a wait, not a judgement. */
const TEST_TIMEOUT_MS = 180_000

for (const cell of CELLS) {
  test.describe(`HUD coverage overlay (ticket 682): ${cell.name}`, () => {
    test.use({
      viewport: cell.viewport,
      isMobile: cell.isTouch,
      hasTouch: cell.isTouch,
      deviceScaleFactor: 1,
    })

    test('lays the tokens out for the cell and reports the reserved layout within its budget', async ({
      page,
    }) => {
      test.setTimeout(TEST_TIMEOUT_MS)
      const errors = await openGame(page, cell)
      expect(await rootLayoutOf(page)).toEqual({
        layout: cell.layout,
        stripHeight: cell.stripHeight,
        slotCell: cell.slotCell,
      })
      const report = await coverageReportOf(page)
      test.info().annotations.push({
        type: 'hud-coverage',
        description: `${cell.name}: measured ${report.measuredPercent}%, reserved ${report.reservedPercent}%, in band [${report.bandIntruderIds.join(', ')}]`,
      })
      expect(report.kind).toBe(cell.layout)
      expect(report.budgetPercent).toBe(cell.budgetPercent)
      expect(report.reservedPercent).toBeLessThanOrEqual(cell.budgetPercent)
      expect(report.isReservedWithinBudget).toBe(true)
      expect(errors).toEqual([])
    })

    test('draws the middle band where the design puts it and prints the report', async ({
      page,
    }) => {
      test.setTimeout(TEST_TIMEOUT_MS)
      await openGame(page, cell)
      expect(await page.evaluate(() => window.steampunkDebug!.ui.showHudCoverage(true))).toEqual({
        ok: true,
      })
      const overlay = page.getByTestId('hud-coverage')
      await expect(overlay).toHaveAttribute('data-layout', cell.layout)
      const band = await page.getByTestId('hud-coverage-band').boundingBox()
      const expected = middleBandOf(cell.viewport)
      expect(band).not.toBeNull()
      expect(Math.abs(band!.y - expected.top)).toBeLessThanOrEqual(SLACK_PX)
      expect(Math.abs(band!.y + band!.height - expected.bottom)).toBeLessThanOrEqual(SLACK_PX)
      expect(Math.abs(band!.x - expected.left)).toBeLessThanOrEqual(SLACK_PX)
      await expect(page.getByTestId('hud-coverage-readout')).toContainText(
        `/ ${cell.budgetPercent}% · layout`,
      )
      await page.evaluate(() => window.steampunkDebug!.ui.showHudCoverage(false))
      await expect(overlay).toHaveCount(0)
    })
  })
}

async function rootLayoutOf(page: Page) {
  return page.evaluate(() => {
    const root = document.documentElement
    const style = getComputedStyle(root)
    return {
      layout: root.dataset.layout ?? '',
      stripHeight: style.getPropertyValue('--strip-height').trim(),
      slotCell: style.getPropertyValue('--slot-cell').trim(),
    }
  })
}

async function coverageReportOf(page: Page): Promise<HudCoverageReport> {
  const result = await page.evaluate(() => window.steampunkDebug!.ui.getHudCoverage())
  if (!result.ok) throw new Error(result.problems.join('; '))
  return result.report
}
