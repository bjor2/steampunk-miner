/**
 * The screen matrix (#173 "Verification", the TD's testable acceptance 1 to 7): on every
 * reference screen, the zoom cap and pillarbox, the render-scale floor, the #38 budgets at the
 * widest zoom, text sizes against the reference screen, TV mode's minimums and safe area, target
 * sizes, focus rings, and no art upscaled at the default zoom. Geometry and counts only, read
 * through the DOM and `steampunkDebug`.
 */
import { expect, test, type Page } from '@playwright/test'
import {
  boxOf,
  buttonBoxes,
  cameraView,
  currentCell,
  dockAt,
  hudPanelBoxes,
  openGame,
  renderStats,
  settledStats,
  shortAxisOf,
  textSizes,
  uiScaleOf,
} from './screenHelpers'

const MAX_GROUND_BLOCKS = 48
const MAX_DRAW_CALLS = 150
const MAX_POINT_LIGHTS = 4
/** The reference machine's screen (#4): today's sizes are measured there. */
const REFERENCE_VIEWPORT = { width: 1280, height: 800 }
/** #173 TV minimums: main text 2.78%, other text 2.22%, controls 5.9% of the short axis. */
const TV_MAIN_TEXT_SHARE = 0.0278
const TV_OTHER_TEXT_SHARE = 0.0222
const TV_CONTROL_SHARE = 0.059
const TV_SAFE_SHARE = 0.05
/** The lowest texel density any baked art has (art/asset-rules.json). */
const LOWEST_TEXELS_PER_METRE = 256
/** The canvas's device-pixel-ratio cap (#173 "Canvas"). */
const CANVAS_MAX_DPR = 2
/** A rounding pixel in the browser's layout. */
const SLACK_PX = 1
/** Font sizes and boxes round to hundredths of a pixel. */
const SIZE_SLACK_PX = 0.05

test.beforeEach(() => {
  test.skip(currentCell().isPortrait, 'portrait shows the turn-your-device card instead')
})

test.describe('screen matrix: canvas (#173)', () => {
  test('caps the zoom-out by the half diagonal and pillarboxes past 64:27', async ({ page }) => {
    const cell = currentCell()
    const errors = await openGame(page, cell)
    await expect
      .poll(async () => (await cameraView(page)).maxViewShortAxisMetres, { timeout: 30_000 })
      .toBeCloseTo(cell.maxViewShortAxisMetres, 1)
    const stage = await boxOf(page, 'game-stage')
    expect(stage.left).toBeCloseTo(cell.stage.left, 0)
    expect(stage.width).toBeCloseTo(cell.stage.width, 0)
    // The canvas is 300 px wide until R3F has measured the stage.
    await expect
      .poll(async () => (await page.locator('canvas').first().boundingBox())?.width)
      .toBeCloseTo(cell.stage.width, 0)
    expect(errors).toEqual([])
  })

  test('floors the render scale per tier, holds a pin at the floor and keeps the #38 budgets', async ({
    page,
  }) => {
    test.setTimeout(300_000)
    const cell = currentCell()
    const errors = await openGame(page, cell)
    await expect
      .poll(async () => (await renderStats(page)).renderScaleFloor, { timeout: 30_000 })
      .toBe(cell.renderScaleFloor)
    await page.evaluate((floor) => {
      window.steampunkDebug!.ui.setZoom(20)
      window.steampunkDebug!.ui.setRenderScale(floor)
    }, cell.renderScaleFloor)
    await expect
      .poll(async () => (await renderStats(page)).renderScale, { timeout: 30_000 })
      .toBe(cell.renderScaleFloor)
    const stats = await settledStats(page)
    expect(stats.groundBlocks).toBeLessThanOrEqual(MAX_GROUND_BLOCKS)
    expect(stats.drawCalls).toBeLessThanOrEqual(MAX_DRAW_CALLS)
    expect(stats.headlamps).toBe(1)
    expect(stats.pointLights).toBeLessThanOrEqual(MAX_POINT_LIGHTS)
    expect(errors).toEqual([])
  })

  test('upscales no baked art at the 12 m default', async ({ page }) => {
    const cell = currentCell()
    const errors = await openGame(page, cell)
    await expect
      .poll(async () => (await cameraView(page)).pixelsPerMetre, { timeout: 30_000 })
      .toBeCloseTo(shortAxisOf(cell) / 12, 3)
    const devicePixelsPerMetre =
      (await cameraView(page)).pixelsPerMetre * Math.min(cell.deviceScaleFactor, CANVAS_MAX_DPR)
    expect(devicePixelsPerMetre).toBeLessThanOrEqual(LOWEST_TEXELS_PER_METRE)
    expect(errors).toEqual([])
  })
})

test.describe('screen matrix: UI (#173)', () => {
  test('sets every HUD and bay-screen text at least its reference size times the UI scale', async ({
    page,
  }) => {
    test.setTimeout(240_000)
    const cell = currentCell()
    const errors = await openGame(page, cell)
    await dockAt(page, 'sell')
    const sizes = await textSizes(page)
    if (cell.isTvMode) expectTenFootText(sizes, shortAxisOf(cell))
    await expect(page.getByTestId('hud-state')).toBeVisible()
    const mainText = await page
      .getByTestId('hud-state')
      .evaluate((element) => Number.parseFloat(getComputedStyle(element).fontSize))
    if (cell.isTvMode) {
      expect(mainText).toBeGreaterThanOrEqual(TV_MAIN_TEXT_SHARE * shortAxisOf(cell) - 0.01)
    }
    await page.evaluate(() => window.steampunkDebug!.ui.setPref('tvMode', false))
    await page.setViewportSize(REFERENCE_VIEWPORT)
    await expect.poll(() => uiScaleOf(page)).toBe(1)
    const reference = await textSizes(page)
    // TV mode adds its minimums on top of the plain scale, so the plain one is the floor here too.
    const scale = Math.max(1, shortAxisOf(cell) / REFERENCE_VIEWPORT.height)
    const compared = Object.keys(sizes).filter((key) => key in reference)
    expect(compared.length).toBeGreaterThan(10)
    const shrunk = compared
      .filter((key) => sizes[key] < reference[key] * scale - SIZE_SLACK_PX)
      .map((key) => `${key}: ${sizes[key]} px < ${reference[key]} x ${scale}`)
    expect(shrunk).toEqual([])
    expect(errors).toEqual([])
  })

  test('keeps every control at least 44 px, 56 on touch, 5.9% tall in TV mode', async ({
    page,
  }) => {
    test.setTimeout(240_000)
    const cell = currentCell()
    const errors = await openGame(page, cell)
    await dockAt(page, 'sell')
    const smallest = cell.isTouch ? 56 : 44
    const bayButtons = await buttonBoxes(page)
    expect(bayButtons.length).toBeGreaterThan(3)
    await pressScreenButton(page, cell.isTouch, 'platform-settings')
    await expect(page.getByTestId('settings-panel')).toBeVisible()
    const settingsButtons = await buttonBoxes(page)
    const tallest = Math.max(smallest, cell.isTvMode ? TV_CONTROL_SHARE * shortAxisOf(cell) : 0)
    const tooSmall = [...bayButtons, ...settingsButtons]
      .filter((box) => box.width < smallest - SIZE_SLACK_PX || box.height < tallest - SIZE_SLACK_PX)
      .map((box) => `${box.id}: ${box.width} x ${box.height}`)
    expect(tooSmall).toEqual([])
    await pressScreenButton(page, cell.isTouch, 'settings-close')
    await expect(page.getByTestId('settings-panel')).toHaveCount(0)
    expect(errors).toEqual([])
  })

  test('rings each bay-screen control on keyboard focus as Tab walks the screen', async ({
    page,
  }) => {
    const cell = currentCell()
    const errors = await openGame(page, cell)
    await dockAt(page, 'sell')
    const enabled = await page.locator('[data-testid="platform-screen"] button:enabled').count()
    expect(enabled).toBeGreaterThan(1)
    for (let stop = 0; stop < enabled; stop++) {
      await page.keyboard.press('Tab')
      const focused = await page.evaluate(() => {
        const element = document.activeElement as HTMLElement
        const style = getComputedStyle(element)
        return {
          isOnScreen: element.closest('[data-testid="platform-screen"]') !== null,
          isRinged: style.outlineStyle !== 'none' || style.boxShadow !== 'none',
          id: element.getAttribute('data-testid'),
        }
      })
      expect(focused).toMatchObject({ isOnScreen: true, isRinged: true })
    }
    expect(errors).toEqual([])
  })

  test('keeps the HUD and the bay screen out of the outer 5% in TV mode', async ({ page }) => {
    const cell = currentCell()
    test.skip(!cell.isTvMode, 'the TV safe area is a TV-mode rule')
    const errors = await openGame(page, cell)
    await dockAt(page, 'sell')
    const inset = {
      x: TV_SAFE_SHARE * cell.viewport.width - SLACK_PX,
      y: TV_SAFE_SHARE * cell.viewport.height - SLACK_PX,
    }
    const boxes = [...(await hudPanelBoxes(page)), await boxOf(page, 'platform-screen')]
    for (const box of boxes) {
      expect(box.left).toBeGreaterThanOrEqual(inset.x)
      expect(box.top).toBeGreaterThanOrEqual(inset.y)
      expect(cell.viewport.width - box.right).toBeGreaterThanOrEqual(inset.x)
      expect(cell.viewport.height - box.bottom).toBeGreaterThanOrEqual(inset.y)
    }
    expect(errors).toEqual([])
  })
})

/** TV mode: every text at least 2.22% of the short axis (other text), the strictest common rule. */
function expectTenFootText(sizes: Record<string, number>, shortAxis: number): void {
  const smallest = TV_OTHER_TEXT_SHARE * shortAxis - SIZE_SLACK_PX
  const tooSmall = Object.entries(sizes)
    .filter(([, size]) => size < smallest)
    .map(([key, size]) => `${key}: ${size} px`)
  expect(tooSmall).toEqual([])
}

/** A finger taps it on a touch screen; elsewhere the mouse clicks it. */
async function pressScreenButton(page: Page, isTouch: boolean, testId: string): Promise<void> {
  const button = page.getByTestId(testId)
  if (isTouch) await button.tap()
  else await button.click()
}
