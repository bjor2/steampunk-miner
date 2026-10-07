/**
 * The look set per screen (#173 "Screenshots"): each cell writes its review shots for the Game
 * Director, never compared (rulebook section 5: no pixel assertions). `npm run screens:update`
 * writes them to `docs/screens/<cell>/`; otherwise they land in the test's output folder.
 *
 * #173's set is the dock with both buildings, a dig with 3 chips and a discovery plaque, the
 * workshop mid-chain and the tech tree. The buildings landed with #175: the dock shot zooms out
 * over both, the yard and the car left on the Works' turntable. The workshop redo (#177) holds a
 * drill power chain for its shot. The chips (#178) and tech tree (#165) are not built yet, so the
 * set shoots a dig and the settings screen in their places; each ticket swaps its shot in when it
 * lands.
 */
import { expect, test, type Page } from '@playwright/test'
import { currentCell, dockAt, openGame, renderStats } from './screenHelpers'
import { VIEW_SHORT_AXIS_DEFAULT_M, VIEW_SHORT_AXIS_MAX_M } from '../../../src/constants/scene'

const JPEG_QUALITY = 80
/** A native 4K frame on software WebGL takes seconds; the shot waits for drawn ground, then this. */
const GROUND_SETTLE_MS = 3000
/** The buildings' atlases are uploaded once the renderer's texture count holds for this long. */
const ART_SETTLE_MS = 3000

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
    await waitForGround(page)
    await standOnTheTurntable(page)
    await shoot(page, 'dock')
    await backToTheSellBay(page)
    await digDown(page)
    await waitForGround(page)
    await shoot(page, 'dig')
    await dockAt(page, 'upgrade')
    await holdMidChain(page)
    await shoot(page, 'workshop')
    await page.getByTestId('platform-settings').click()
    await expect(page.getByTestId('settings-panel')).toBeVisible()
    await shoot(page, 'settings')
    expect(errors).toEqual([])
  })
})

/** The workshop mid-chain (#177): a drill power hold, shot once it has climbed past its wind-up. */
async function holdMidChain(page: Page): Promise<void> {
  await page.evaluate(() => {
    window.steampunkDebug!.giveMoney('1e9')
    window.steampunkDebug!.features.workshop.holdBuy('drill_power', 30)
  })
  await expect
    .poll(() =>
      page.evaluate(() => {
        const chain = window.steampunkDebug!.features.workshop.getChain() as unknown as {
          hold: { steps: number } | null
        }
        return chain.hold?.steps ?? 0
      }),
    )
    .toBeGreaterThanOrEqual(6)
}

/** Any key takes the opening transmission down; on touch, a tap brings the controls back. */
async function dismissTransmission(page: Page): Promise<void> {
  await page.keyboard.press('KeyX')
  if (currentCell().isTouch) await page.touchscreen.tap(currentCell().viewport.width / 2, 20)
}

/** Both buildings in view (#175): zoomed out, the car left on the Works' turntable. */
async function standOnTheTurntable(page: Page): Promise<void> {
  await page.evaluate((zoom) => window.steampunkDebug!.ui.setZoom(zoom), VIEW_SHORT_AXIS_MAX_M)
  await dockAt(page, 'upgrade')
  await page.evaluate(() => window.steampunkDebug!.input.tap('ui_cancel'))
  await waitForArt(page)
}

/** The dig starts where a run does, on the Sell bay at the default zoom. */
async function backToTheSellBay(page: Page): Promise<void> {
  await page.evaluate((zoom) => window.steampunkDebug!.ui.setZoom(zoom), VIEW_SHORT_AXIS_DEFAULT_M)
  await dockAt(page, 'sell')
  await page.evaluate(() => window.steampunkDebug!.input.tap('ui_cancel'))
}

async function waitForArt(page: Page): Promise<void> {
  let previous = -1
  await expect
    .poll(
      async () => {
        await page.waitForTimeout(ART_SETTLE_MS)
        const memory = await page.evaluate(() => window.steampunkDebug!.ui.getRendererMemory())
        const textures = memory.ok ? memory.textures : -1
        const isSettled = textures > 0 && textures === previous
        previous = textures
        return isSettled
      },
      { timeout: 240_000 },
    )
    .toBe(true)
}

/** A strong drill, a short drive off the pad and four seconds straight down. */
async function digDown(page: Page): Promise<void> {
  await page.evaluate(() => {
    const debug = window.steampunkDebug!
    debug.setUpgrade('drill_power', 120)
    debug.setUpgrade('drill_tip', 120)
    debug.setUpgrade('engine', 80)
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

/** The ground drawn around the rig; the review shot needs a picture, not settled counts. */
async function waitForGround(page: Page): Promise<void> {
  await expect
    .poll(async () => (await renderStats(page)).groundBlocks, { timeout: 240_000 })
    .toBeGreaterThan(0)
  await page.waitForTimeout(GROUND_SETTLE_MS)
}

async function shoot(page: Page, shot: string): Promise<void> {
  const cell = currentCell()
  const path = process.env.UPDATE_SCREENS
    ? `docs/screens/${cell.name}/${shot}.jpg`
    : test.info().outputPath(`${shot}.jpg`)
  await page.screenshot({ path, type: 'jpeg', quality: JPEG_QUALITY })
}
