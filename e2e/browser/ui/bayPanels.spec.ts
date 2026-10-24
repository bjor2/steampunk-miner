/**
 * The Sell bay's panel slot (ticket 845, the TD ruling on #821 Q3, HS 3) on the example slice's
 * sample merchants, at 360x640 and 1280x800 with 1 merchant and with 5. A phone draws every
 * merchant under the bay's own rows and the bay's scroll area reaches the last one; desktop pages
 * them two at a time, Next and Previous turning round. With no merchant shown the slot draws
 * nothing. State and geometry through the DOM and `steampunkDebug` only, never pixels.
 */
import { expect, test, type Page } from '@playwright/test'
import { UI_IDS } from '../../../src/ui/ids'
import { BAY_PANEL_UI_IDS } from '../../../src/ui/platform/bayPanelIds'
import { dockAt } from '../screens/screenHelpers'
import { openGame, SLACK_PX } from '../hud/hudLayoutHelpers'
import { UI_SHOT_CELLS, type UiShotCell } from './uiShotCells'
import { openSellBayWithMerchants } from './uiShotSheets'

/** Software WebGL on a loaded box is slow; this is a wait, not a judgement. */
const TEST_TIMEOUT_MS = 180_000
/** The ticket's two golden sizes. */
const CELL_NAMES = ['phone-360x640', 'desktop-1280x800']
const PANEL = '[data-bay-panel-id]'
const PLATFORM = `[data-testid="${UI_IDS.platformScreen}"]`

const merchantId = (place: number) => `example.merchant-${place}`

for (const cell of UI_SHOT_CELLS.filter((candidate) => CELL_NAMES.includes(candidate.name))) {
  test.describe(`Sell bay panels (ticket 845): ${cell.name}`, () => {
    test.use({
      viewport: cell.viewport,
      isMobile: cell.isTouch,
      hasTouch: cell.isTouch,
      deviceScaleFactor: 1,
    })

    test('draws nothing in the slot while no merchant is shown', async ({ page }) => {
      test.setTimeout(TEST_TIMEOUT_MS)
      const errors = await openGame(page, cell)
      await dockAt(page, 'sell')
      await expect(page.getByTestId(UI_IDS.sellbayScreen)).toBeVisible()
      await expect(page.getByTestId(BAY_PANEL_UI_IDS.list)).toHaveCount(0)
      expect(errors).toEqual([])
    })

    test('reaches one merchant inside the bay, with no pager', async ({ page }) => {
      test.setTimeout(TEST_TIMEOUT_MS)
      const errors = await openGame(page, cell)
      await openSellBayWithMerchants(page, 1)
      await expect(page.locator(PANEL)).toHaveCount(1)
      await expect(page.getByTestId(BAY_PANEL_UI_IDS.list)).toHaveAttribute('data-page-count', '1')
      await expect(page.getByTestId(BAY_PANEL_UI_IDS.next)).toHaveCount(0)
      await expectReachableInsideBay(page, merchantId(1))
      await expectNoSidewaysScroll(page, cell)
      expect(errors).toEqual([])
    })

    if (cell.layout === 'phone') {
      test('draws all five merchants in one column and scrolls the bay to the last', async ({
        page,
      }) => {
        test.setTimeout(TEST_TIMEOUT_MS)
        await openGame(page, cell)
        await openSellBayWithMerchants(page, 5)
        const list = page.getByTestId(BAY_PANEL_UI_IDS.list)
        await expect(list).toHaveAttribute('data-layout', 'phone')
        await expect(page.locator(PANEL)).toHaveCount(5)
        await expect(page.getByTestId(BAY_PANEL_UI_IDS.next)).toHaveCount(0)
        expect(await isBayScrolling(page)).toBe(true)
        await expectReachableInsideBay(page, merchantId(5))
        await expectOneColumn(page)
        await expectNoSidewaysScroll(page, cell)
      })
    } else {
      test('pages five merchants two at a time, turning round with Next and Previous', async ({
        page,
      }) => {
        test.setTimeout(TEST_TIMEOUT_MS)
        await openGame(page, cell)
        await openSellBayWithMerchants(page, 5)
        const list = page.getByTestId(BAY_PANEL_UI_IDS.list)
        await expect(list).toHaveAttribute('data-layout', 'desktop')
        await expect(list).toHaveAttribute('data-page-count', '3')
        expect(await drawnMerchants(page)).toEqual([merchantId(1), merchantId(2)])
        await turnPage(page, BAY_PANEL_UI_IDS.next)
        expect(await drawnMerchants(page)).toEqual([merchantId(3), merchantId(4)])
        await turnPage(page, BAY_PANEL_UI_IDS.next)
        expect(await drawnMerchants(page)).toEqual([merchantId(5)])
        await expectReachableInsideBay(page, merchantId(5))
        await turnPage(page, BAY_PANEL_UI_IDS.next)
        expect(await drawnMerchants(page)).toEqual([merchantId(1), merchantId(2)])
        await turnPage(page, BAY_PANEL_UI_IDS.previous)
        expect(await drawnMerchants(page)).toEqual([merchantId(5)])
        await expectNoSidewaysScroll(page, cell)
      })
    }
  })
}

async function drawnMerchants(page: Page): Promise<string[]> {
  return page
    .locator(PANEL)
    .evaluateAll((panels) => panels.map((panel) => panel.getAttribute('data-bay-panel-id') ?? ''))
}

async function turnPage(page: Page, buttonTestId: string): Promise<void> {
  const list = page.getByTestId(BAY_PANEL_UI_IDS.list)
  const before = await list.getAttribute('data-page')
  await page.getByTestId(buttonTestId).click()
  await expect(list).not.toHaveAttribute('data-page', before ?? '')
}

/** Scrolled to, the merchant's panel sits inside the bay screen's box. */
async function expectReachableInsideBay(page: Page, panelId: string): Promise<void> {
  const panel = page.locator(`[data-bay-panel-id="${panelId}"]`)
  await panel.scrollIntoViewIfNeeded()
  const box = (await panel.boundingBox())!
  const bay = (await page.locator(PLATFORM).boundingBox())!
  expect(box.x).toBeGreaterThanOrEqual(bay.x - SLACK_PX)
  expect(box.x + box.width).toBeLessThanOrEqual(bay.x + bay.width + SLACK_PX)
  expect(box.y).toBeGreaterThanOrEqual(bay.y - SLACK_PX)
  expect(box.y).toBeLessThan(bay.y + bay.height)
}

/** The bay's own scroll area holds more than it shows. */
async function isBayScrolling(page: Page): Promise<boolean> {
  return page.evaluate((platform) => {
    const viewport = document.querySelector(`${platform} [data-scroll-area] > div`)
    return viewport !== null && viewport.scrollHeight > viewport.clientHeight
  }, PLATFORM)
}

async function expectOneColumn(page: Page): Promise<void> {
  const lefts = await page
    .locator(PANEL)
    .evaluateAll((panels) => panels.map((panel) => Math.round(panel.getBoundingClientRect().x)))
  expect(new Set(lefts).size).toBe(1)
}

async function expectNoSidewaysScroll(page: Page, cell: UiShotCell): Promise<void> {
  const width = await page.evaluate(() => document.documentElement.scrollWidth)
  expect(width).toBeLessThanOrEqual(cell.viewport.width)
}
