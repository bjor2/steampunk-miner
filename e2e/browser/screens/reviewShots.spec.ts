/**
 * The look set per screen (#173 "Screenshots"): each cell writes its review shots for the Game
 * Director, never compared (rulebook section 5: no pixel assertions). `npm run screens:update`
 * writes them to `docs/screens/<cell>/`; otherwise they land in the test's output folder.
 *
 * #173's set is the dock with both buildings, a dig with 3 chips and a discovery plaque, the
 * workshop mid-chain and the tech tree. The buildings (#175), chips (#178), workshop redo (#177)
 * and tech tree (#165) are not built yet, so the set shoots today's dock, a dig, the Upgrade bay
 * and the settings screen in their places; each ticket swaps its shot in when it lands.
 */
import { expect, test, type Page } from '@playwright/test'
import { currentCell, dockAt, openGame, settledStats } from './screenHelpers'

const JPEG_QUALITY = 80

test.describe('screen matrix: review shots (#173)', () => {
  test('writes the look set for this screen', async ({ page }) => {
    test.setTimeout(600_000)
    const cell = currentCell()
    const errors = await openGame(page, cell)
    if (cell.isPortrait) {
      await shoot(page, 'portrait-card')
      return expect(errors).toEqual([])
    }
    await page.evaluate(() => window.steampunkDebug!.ui.setRenderScale(1))
    await dismissTransmission(page)
    await settledStats(page)
    await shoot(page, 'dock')
    await digDown(page)
    await settledStats(page)
    await shoot(page, 'dig')
    await dockAt(page, 'upgrade')
    await shoot(page, 'workshop')
    await page.getByTestId('platform-settings').click()
    await expect(page.getByTestId('settings-panel')).toBeVisible()
    await shoot(page, 'settings')
    expect(errors).toEqual([])
  })
})

/** Any key takes the opening transmission down; on touch, a tap brings the controls back. */
async function dismissTransmission(page: Page): Promise<void> {
  await page.keyboard.press('KeyX')
  if (currentCell().isTouch) await page.touchscreen.tap(currentCell().viewport.width / 2, 20)
}

/** A strong drill, a short drive off the pad and four seconds straight down. */
async function digDown(page: Page): Promise<void> {
  await page.evaluate(() => {
    const debug = window.steampunkDebug!
    debug.setUpgrade('drill_power', 12)
    debug.setUpgrade('drill_tip', 12)
    debug.setUpgrade('engine', 8)
    debug.input.press('aim_left')
  })
  await page.waitForTimeout(1500)
  await page.evaluate(() => {
    window.steampunkDebug!.input.release('aim_left')
    window.steampunkDebug!.input.press('aim_down')
  })
  await page.waitForTimeout(4000)
  await page.evaluate(() => window.steampunkDebug!.input.release('aim_down'))
}

async function shoot(page: Page, shot: string): Promise<void> {
  const cell = currentCell()
  const path = process.env.UPDATE_SCREENS
    ? `docs/screens/${cell.name}/${shot}.jpg`
    : test.info().outputPath(`${shot}.jpg`)
  await page.screenshot({ path, type: 'jpeg', quality: JPEG_QUALITY })
}
