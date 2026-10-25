/**
 * Buying kit items at the merchant (ticket 850, PK4b) at 360x640 and 1280x800: planet 1's Cache
 * Crate bought through its line's Buy, carried as the HUD count and the Cache Crates list's drop,
 * locked with its reason once three are carried; planet 2's Scree Plough held from sale (the GD's
 * ship rule on #850, until #882 lands the hazard verbs) and its line locked as owned once granted.
 * State and geometry through the DOM and `steampunkDebug` only, never pixels.
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
const buyOf = (itemId: string) => `[data-testid="planet-kit-merchant-buy-${itemId}"]`

interface KitHoldingsRead {
  tools: string[]
  stacks: { itemId: string; g: string; count: string }[]
}

async function moveToPlanet(page: Page, planet: number): Promise<void> {
  const moved = await page.evaluate((index) => window.steampunkDebug!.setPlanet(index).ok, planet)
  expect(moved).toBe(true)
}

async function giveMoney(page: Page): Promise<void> {
  const given = await page.evaluate(() => window.steampunkDebug!.giveMoney('1e12').ok)
  expect(given).toBe(true)
}

function readHoldings(page: Page): Promise<KitHoldingsRead> {
  return page.evaluate(() => {
    const result = window.steampunkDebug!.features['planet-kit'].kitHoldings() as {
      holdings?: KitHoldingsRead
    }
    return result.holdings ?? { tools: [], stacks: [] }
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

async function pressBuy(page: Page, itemId: string): Promise<void> {
  const buy = page.locator(`${MERCHANT} ${buyOf(itemId)}`)
  await buy.scrollIntoViewIfNeeded()
  await buy.click()
}

for (const cell of UI_SHOT_CELLS.filter((candidate) => CELL_NAMES.includes(candidate.name))) {
  test.describe(`kit buying (ticket 850): ${cell.name}`, () => {
    test.use({
      viewport: cell.viewport,
      isMobile: cell.isTouch,
      hasTouch: cell.isTouch,
      deviceScaleFactor: 1,
    })

    test('buys Cache Crates at planet 1’s merchant up to the carry limit', async ({ page }) => {
      test.setTimeout(TEST_TIMEOUT_MS)
      const errors = await openGame(page, cell)
      await giveMoney(page)
      await openSellBay(page)
      await expectInsideBay(page, `${MERCHANT} ${buyOf('cache_crate')}`)
      for (let crate = 1; crate <= 3; crate += 1) {
        await pressBuy(page, 'cache_crate')
        await expect
          .poll(async () => (await readHoldings(page)).stacks)
          .toEqual([{ itemId: 'cache_crate', g: '1', count: String(crate) }])
      }
      await expect(page.locator(`${MERCHANT} ${buyOf('cache_crate')}`)).toHaveCount(0)
      await expect(page.locator(MERCHANT)).toContainText('Carrying the most.')
      await expect(page.locator(MERCHANT)).toContainText('3/3')
      await expectNoSidewaysScroll(page, cell)
      expect(errors).toEqual([])
    })

    test('holds planet 2’s Scree Plough from sale, and locks it as owned once granted', async ({
      page,
    }) => {
      test.setTimeout(TEST_TIMEOUT_MS)
      const errors = await openGame(page, cell)
      await moveToPlanet(page, 2)
      await giveMoney(page)
      await openSellBay(page)
      await expect(page.locator(MERCHANT)).toContainText('Not on sale yet.')
      await expect(page.locator(`${MERCHANT} ${buyOf('scree_plough')}`)).toHaveCount(0)
      const granted = await page.evaluate(
        () => window.steampunkDebug!.features['planet-kit'].grantKitItem('scree_plough').ok,
      )
      expect(granted).toBe(true)
      await expect.poll(async () => (await readHoldings(page)).tools).toEqual(['scree_plough'])
      await expect(page.locator(MERCHANT)).toContainText('Owned.')
      await expect(page.locator(`${MERCHANT} ${buyOf('scree_plough')}`)).toHaveCount(0)
      await expectNoSidewaysScroll(page, cell)
      expect(errors).toEqual([])
    })

    test('counts a carried crate on the HUD', async ({ page }) => {
      test.setTimeout(TEST_TIMEOUT_MS)
      const errors = await openGame(page, cell)
      const granted = await page.evaluate(
        () => window.steampunkDebug!.features['planet-kit'].grantKitItem('cache_crate').ok,
      )
      expect(granted).toBe(true)
      // The compact HUD folds the gauges panels into its tray, so the count is judged attached.
      const count = page.getByTestId('planet-kit-carried-crates')
      await expect(count).toHaveAttribute('aria-label', 'Cache Crates carried: 1')
      expect(errors).toEqual([])
    })
  })
}
