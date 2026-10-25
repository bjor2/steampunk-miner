/**
 * The planet's merchant on the Sell bay (ticket 821, PK2), drawn on #845's panel slot at 360x640
 * and 1280x800: planet 1's Hearthmoor Assay with its premium tag and the Cache Crate, planet 5's
 * Boilerhouse with its three tools, every line reached inside the bay with no sideways scroll, and
 * no merchant on planet 6. State and geometry through the DOM and `steampunkDebug` only, never
 * pixels.
 */
import { expect, test, type Page } from '@playwright/test'
import { UI_IDS } from '../../src/ui/ids'
import { dockAt } from './screens/screenHelpers'
import { openGame, SLACK_PX } from './hud/hudLayoutHelpers'
import { UI_SHOT_CELLS, type UiShotCell } from './ui/uiShotCells'

/** Software WebGL on a loaded box is slow; this is a wait, not a judgement. */
const TEST_TIMEOUT_MS = 180_000
const CELL_NAMES = ['phone-360x640', 'desktop-1280x800']
const MERCHANT = '[data-bay-panel-id="planet-kit.merchant"]'
const PLATFORM = `[data-testid="${UI_IDS.platformScreen}"]`

interface MerchantRead {
  name: string
  premiumTag: string
  stock: { itemId: string; name: string }[]
}

async function moveToPlanet(page: Page, planet: number): Promise<void> {
  const moved = await page.evaluate((index) => window.steampunkDebug!.setPlanet(index).ok, planet)
  expect(moved).toBe(true)
}

function readMerchant(page: Page): Promise<MerchantRead | null> {
  return page.evaluate(() => {
    const result = window.steampunkDebug!.features['planet-kit'].merchant() as {
      merchant?: MerchantRead | null
    }
    return result.merchant ?? null
  })
}

async function openSellBay(page: Page): Promise<void> {
  await dockAt(page, 'sell')
  await expect(page.getByTestId(UI_IDS.sellbayScreen)).toBeVisible()
}

/** Scrolled to, the element sits inside the bay screen's box. */
async function expectInsideBay(page: Page, selector: string): Promise<void> {
  const element = page.locator(selector)
  await element.scrollIntoViewIfNeeded()
  const box = (await element.boundingBox())!
  const bay = (await page.locator(PLATFORM).boundingBox())!
  expect(box.x).toBeGreaterThanOrEqual(bay.x - SLACK_PX)
  expect(box.x + box.width).toBeLessThanOrEqual(bay.x + bay.width + SLACK_PX)
  expect(box.y).toBeGreaterThanOrEqual(bay.y - SLACK_PX)
  expect(box.y).toBeLessThan(bay.y + bay.height)
}

async function expectNoSidewaysScroll(page: Page, cell: UiShotCell): Promise<void> {
  const width = await page.evaluate(() => document.documentElement.scrollWidth)
  expect(width).toBeLessThanOrEqual(cell.viewport.width)
}

for (const cell of UI_SHOT_CELLS.filter((candidate) => CELL_NAMES.includes(candidate.name))) {
  test.describe(`merchant panel (ticket 821): ${cell.name}`, () => {
    test.use({
      viewport: cell.viewport,
      isMobile: cell.isTouch,
      hasTouch: cell.isTouch,
      deviceScaleFactor: 1,
    })

    test('draws planet 1’s merchant, its premium tag and its stock inside the bay', async ({
      page,
    }) => {
      test.setTimeout(TEST_TIMEOUT_MS)
      const errors = await openGame(page, cell)
      await openSellBay(page)
      expect(await readMerchant(page)).toMatchObject({
        name: 'Hearthmoor Assay',
        premiumTag: 'Pays extra for Honey Amber.',
        stock: [{ itemId: 'cache_crate' }],
      })
      const panel = page.locator(MERCHANT)
      await expect(panel).toContainText('Hearthmoor Assay')
      await expect(panel).toContainText('Pays extra for Honey Amber.')
      await expect(panel).toContainText('Cache Crate')
      await expectInsideBay(page, MERCHANT)
      await expectNoSidewaysScroll(page, cell)
      expect(errors).toEqual([])
    })

    test('reaches every line of planet 5’s longer stock inside the bay', async ({ page }) => {
      test.setTimeout(TEST_TIMEOUT_MS)
      const errors = await openGame(page, cell)
      await moveToPlanet(page, 5)
      await openSellBay(page)
      const merchant = await readMerchant(page)
      expect(merchant?.stock.map((line) => line.itemId)).toEqual([
        'scree_plough',
        'shard_tongs',
        'vent_vane',
      ])
      for (const itemId of ['scree_plough', 'shard_tongs', 'vent_vane']) {
        await expectInsideBay(
          page,
          `${MERCHANT} [data-ui-text="planet-kit.merchant.stock.${itemId}"]`,
        )
      }
      await expectNoSidewaysScroll(page, cell)
      expect(errors).toEqual([])
    })

    test('draws no merchant on a planet where none trades', async ({ page }) => {
      test.setTimeout(TEST_TIMEOUT_MS)
      const errors = await openGame(page, cell)
      await moveToPlanet(page, 6)
      await openSellBay(page)
      expect(await readMerchant(page)).toBeNull()
      await expect(page.locator(MERCHANT)).toHaveCount(0)
      expect(errors).toEqual([])
    })
  })
}
