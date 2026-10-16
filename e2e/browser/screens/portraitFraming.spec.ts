/**
 * The portrait framing on the preview build (ticket 484, the GD's option (a) on #484): a portrait
 * cell shows desktop's vertical metres, so a descent crosses the same share of the screen a second
 * as on desktop, the width is derived from the screen's shape, the render scale keeps the cell's
 * floor, and the hazard strip, the declared cue across a narrow screen, lies along the long axis
 * with at most 8 pips in its fixed share of the screen. State and DOM boxes only, never pixels.
 * Runs in the portrait cells of the screen matrix; the law itself is pinned in
 * `src/systems/render/viewZoom.test.ts` and `speedFraming.test.ts`.
 */
import { expect, test, type Page } from '@playwright/test'
import { STRIP_LENGTH_VMIN, STRIP_MAX_PIPS } from '../../../src/constants/hazardStrip'
import { VIEW_SHORT_AXIS_DEFAULT_M } from '../../../src/constants/scene'
import {
  cameraView,
  currentCell,
  startDiggingDown,
  openGame,
  renderStats,
  shortAxisOf,
} from './screenHelpers'

/** The 0.9 m collider over 12 m down the screen (#39 acceptance 1). */
const COLLIDER_SHARE_AT_DEFAULT = 0.075
const SAMPLE_SECONDS = 8
/** Desktop's 16:9 shape at a size software GL draws quickly (cap 20 m, as 1920 x 1080). */
const DESKTOP_SHAPE = { width: 1280, height: 720 }
/** The camera's eases (0.5 s felt speed, 0.5 s out, 1 s in) and the ground's own changes. */
const SMOOTHING_SHARE = 0.15
/** A rounding pixel in the browser's layout. */
const SLACK_PX = 1

interface DescentSample {
  feltSpeedCellsPerSecond: number
  screensPerSecond: number
}

test.beforeEach(() => {
  test.skip(!currentCell().isPortrait, 'the portrait framing runs on the portrait cells')
})

test.describe('portrait framing (ticket 484)', () => {
  test("shows the desktop's vertical metres on the portrait cell", async ({ page }) => {
    const cell = currentCell()
    const errors = await openGame(page, cell)
    await expect
      .poll(async () => (await cameraView(page)).viewShortAxisMetres, { timeout: 30_000 })
      .toBeCloseTo(VIEW_SHORT_AXIS_DEFAULT_M, 3)
    const view = await cameraView(page)
    expect(view.vehicleColliderShare).toBeCloseTo(COLLIDER_SHARE_AT_DEFAULT, 3)
    expect(view.pixelsPerMetre).toBeCloseTo(cell.viewport.height / VIEW_SHORT_AXIS_DEFAULT_M, 3)
    expect(view.maxViewShortAxisMetres).toBeCloseTo(cell.maxViewShortAxisMetres, 2)
    expect(errors).toEqual([])
  })

  test('a descent at the same drill level crosses the same screens a second as desktop', async ({
    page,
  }) => {
    test.setTimeout(300_000)
    const cell = currentCell()
    const errors = await openGame(page, cell)
    await startDiggingDown(page)
    const portrait = await sampleDescent(page, cell.viewport.height)
    await page.setViewportSize(DESKTOP_SHAPE)
    const desktop = await sampleDescent(page, DESKTOP_SHAPE.height)
    await test.info().attach('screens a second, portrait then desktop', {
      body: JSON.stringify({ portrait, desktop }, null, 2),
      contentType: 'application/json',
    })
    expect(medianOf(portrait, 'feltSpeedCellsPerSecond')).toBeGreaterThan(0)
    const ratio = medianOf(portrait, 'screensPerSecond') / medianOf(desktop, 'screensPerSecond')
    expect(Math.abs(ratio - 1)).toBeLessThanOrEqual(SMOOTHING_SHARE)
    expect(errors).toEqual([])
  })

  test('the horizontal extent matches width over height on the portrait cell', async ({ page }) => {
    const cell = currentCell()
    const errors = await openGame(page, cell)
    for (const zoom of [8, 12, 20]) {
      await page.evaluate((metres) => window.steampunkDebug!.ui.setZoom(metres), zoom)
      await expect
        .poll(async () => (await cameraView(page)).viewShortAxisMetres, { timeout: 30_000 })
        .toBeCloseTo(zoom, 3)
      const view = await cameraView(page)
      const widthOverHeight = cell.viewport.width / cell.viewport.height
      expect(view.viewHorizontalMetres).toBeCloseTo(view.viewShortAxisMetres * widthOverHeight, 6)
    }
    expect(errors).toEqual([])
  })

  test("renders at the cell's scale floor", async ({ page }) => {
    const cell = currentCell()
    const errors = await openGame(page, cell)
    await expect
      .poll(async () => (await renderStats(page)).renderScaleFloor, { timeout: 30_000 })
      .toBe(cell.renderScaleFloor)
    await page.evaluate(
      (floor) => window.steampunkDebug!.ui.setRenderScale(floor),
      cell.renderScaleFloor,
    )
    await expect
      .poll(async () => (await renderStats(page)).renderScale, { timeout: 30_000 })
      .toBe(cell.renderScaleFloor)
    expect(errors).toEqual([])
  })

  test('the hazard strip runs along the long axis on the portrait cells and shows at most 8 pips within a fixed pixel budget', async ({
    page,
  }) => {
    test.setTimeout(300_000)
    const cell = currentCell()
    const errors = await openGame(page, cell)
    await startDiggingDown(page)
    const budget = (shortAxisOf(cell) * STRIP_LENGTH_VMIN) / 100
    for (let second = 0; second < SAMPLE_SECONDS; second++) {
      await page.waitForTimeout(1000)
      const strip = await readStrip(page)
      expect(strip.isShown).toBe(true)
      expect(strip.height).toBeGreaterThan(strip.width)
      expect(strip.height).toBeCloseTo(budget, 0)
      expect(strip.pipCount).toBeLessThanOrEqual(STRIP_MAX_PIPS)
      expect(strip.top).toBeGreaterThanOrEqual(-SLACK_PX)
      expect(strip.bottom).toBeLessThanOrEqual(cell.viewport.height + SLACK_PX)
    }
    expect(errors).toEqual([])
  })
})

/** Once a second: the felt speed, and how many screen heights a second that is on this canvas. */
async function sampleDescent(page: Page, heightPixels: number): Promise<DescentSample[]> {
  const samples: DescentSample[] = []
  for (let second = 0; second < SAMPLE_SECONDS; second++) {
    await page.waitForTimeout(1000)
    const view = await cameraView(page)
    samples.push({
      feltSpeedCellsPerSecond: view.feltSpeedCellsPerSecond,
      screensPerSecond: (view.feltSpeedCellsPerSecond * view.pixelsPerMetre) / heightPixels,
    })
  }
  return samples
}

function medianOf(samples: readonly DescentSample[], field: keyof DescentSample): number {
  const sorted = samples.map((sample) => sample[field]).sort((a, b) => a - b)
  return sorted[Math.floor(sorted.length / 2)]
}

/** The strip's track box on screen and how many pips it shows now. */
function readStrip(page: Page) {
  return page.evaluate(() => {
    const strip = document.querySelector<HTMLElement>('[data-testid="hud-hazard-strip"]')!
    const track = strip.firstElementChild!.getBoundingClientRect()
    const pips = strip.querySelectorAll('[data-slot]:not([hidden])').length
    return {
      isShown: !strip.hidden,
      width: track.width,
      height: track.height,
      top: track.top,
      bottom: track.bottom,
      pipCount: pips,
    }
  })
}
