/**
 * Desktop warnings and the star map's hook (spec #678, ticket 769, GD lock 23 Oct) at 1280x800 and
 * 1920x1080, with a 360x640 phone for what a phone must not draw: M or a click on the strip's fuel
 * wells opens the star map's panel in the dock beside the view, at most a quarter of the screen,
 * and M, Escape or its Close shuts it; while it is open the hazard strip of a dive lies along the
 * drive inside the narrowed view, under the HUD strip and left of the panel. State and geometry
 * through the DOM and `steampunkDebug` only, never pixels.
 */
import { expect, test, type Page } from '@playwright/test'
import { UI_IDS } from '../../../src/ui/ids'
import { STAR_MAP_UI_IDS } from '../../../src/ui/starMap/starMapIds'
import { openGame, SLACK_PX, type HudLayoutCell } from '../hud/hudLayoutHelpers'
import { startDiggingDown } from '../screens/screenHelpers'
import { undock } from './uiShotSheets'

/** Software WebGL on a loaded box is slow; this is a wait, not a judgement. */
const TEST_TIMEOUT_MS = 240_000
/** The dock's share of the screen at most (`layout.sheetDock.maxSharePercent`). */
const DOCK_SHARE_MAX = 0.25
const SAMPLE_SECONDS = 5
const PANEL = STAR_MAP_UI_IDS.starMapPanel
const CHART = STAR_MAP_UI_IDS.starMapChart

const CELLS: readonly HudLayoutCell[] = [
  { name: 'desktop-1280x800', width: 1280, height: 800 },
  { name: 'desktop-1920x1080', width: 1920, height: 1080 },
].map(({ name, width, height }) => ({
  name,
  viewport: { width, height },
  isTouch: false,
  isTvMode: false,
  floor: null,
}))

const PHONE: HudLayoutCell = {
  name: 'phone-360x640',
  viewport: { width: 360, height: 640 },
  isTouch: true,
  isTvMode: false,
  floor: null,
}

for (const cell of CELLS) {
  test.describe(`desktop star map hook (ticket 769): ${cell.name}`, () => {
    test.use({ viewport: cell.viewport, isMobile: false, hasTouch: false, deviceScaleFactor: 1 })

    test('opens the star map beside the view with M or a click, and shuts it with M, Escape or Close', async ({
      page,
    }) => {
      test.setTimeout(TEST_TIMEOUT_MS)
      const errors = await openPlainGame(page, cell)
      await undock(page)
      await page.keyboard.press('KeyM')
      await expect(page.getByTestId(PANEL)).toBeVisible()
      await expect(page.getByTestId(CHART)).toBeAttached()
      const panel = await boxOf(page, `[data-testid="${PANEL}"]`)
      expect(panel.width).toBeLessThanOrEqual(cell.viewport.width * DOCK_SHARE_MAX + SLACK_PX)
      const strip = await boxOf(page, `[data-testid="${UI_IDS.hudStrip}"]`)
      expect(strip.x + strip.width).toBeLessThanOrEqual(panel.x + SLACK_PX)
      await page.keyboard.press('KeyM')
      await expect(page.getByTestId(PANEL)).toHaveCount(0)

      await page.getByTestId(UI_IDS.hudStarMapButton).click()
      await expect(page.getByTestId(PANEL)).toBeVisible()
      await expect(
        page.locator(`[data-testid="${UI_IDS.hudStarMapButton}"] [data-key-tag="M"]`),
      ).toBeVisible()
      await page.keyboard.press('Escape')
      await expect(page.getByTestId(PANEL)).toHaveCount(0)
      expect(await isPauseMenuOpen(page)).toBe(false)

      await page.keyboard.press('KeyM')
      await page.locator(`[data-testid="${PANEL}"] [data-sheet-close]`).click()
      await expect(page.getByTestId(PANEL)).toHaveCount(0)
      expect(errors).toEqual([])
    })

    test('keeps the hazard strip inside the narrowed view while the star map is open', async ({
      page,
    }) => {
      test.setTimeout(TEST_TIMEOUT_MS)
      const errors = await openPlainGame(page, cell)
      await undock(page)
      await page.keyboard.press('KeyM')
      await expect(page.getByTestId(PANEL)).toBeVisible()
      await startDiggingDown(page)
      const panel = await boxOf(page, `[data-testid="${PANEL}"]`)
      const hudStrip = await boxOf(page, `[data-testid="${UI_IDS.hudStrip}"]`)
      let shownSamples = 0
      for (let second = 0; second < SAMPLE_SECONDS; second++) {
        await page.waitForTimeout(1000)
        const track = await readTrack(page)
        if (!track.isShown) continue
        shownSamples += 1
        expect(track.left).toBeGreaterThanOrEqual(-SLACK_PX)
        expect(track.right).toBeLessThanOrEqual(panel.x + SLACK_PX)
        expect(track.top).toBeGreaterThanOrEqual(hudStrip.y + hudStrip.height - SLACK_PX)
        expect(track.bottom).toBeLessThanOrEqual(cell.viewport.height + SLACK_PX)
      }
      expect(shownSamples).toBeGreaterThan(0)
      expect(errors).toEqual([])
    })
  })
}

test.describe('star map hook on a phone (ticket 769)', () => {
  test.use({ viewport: PHONE.viewport, isMobile: true, hasTouch: true, deviceScaleFactor: 1 })

  test('draws no star map button and no docked panel on a phone', async ({ page }) => {
    test.setTimeout(TEST_TIMEOUT_MS)
    const errors = await openPlainGame(page, PHONE)
    await undock(page)
    await page.keyboard.press('KeyM')
    await expect(page.getByTestId(UI_IDS.hudStarMapButton)).toHaveCount(0)
    await expect(page.getByTestId(PANEL)).toHaveCount(0)
    expect(errors).toEqual([])
  })
})

async function openPlainGame(page: Page, cell: HudLayoutCell): Promise<string[]> {
  const errors = await openGame(page, cell)
  await page.keyboard.press('KeyK')
  return errors
}

function isPauseMenuOpen(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const result = window.steampunkDebug!.ui.getPauseMenuModel()
    if (!result.ok) throw new Error('getPauseMenuModel failed')
    return result.model !== null
  })
}

/** The hazard strip's track box on screen, and whether the strip shows now. */
function readTrack(page: Page) {
  return page.evaluate(() => {
    const strip = document.querySelector<HTMLElement>('[data-testid="hud-hazard-strip"]')!
    const track = strip.firstElementChild!.getBoundingClientRect()
    return {
      isShown: !strip.hidden,
      left: track.left,
      right: track.right,
      top: track.top,
      bottom: track.bottom,
    }
  })
}

async function boxOf(page: Page, selector: string) {
  const box = await page.locator(selector).boundingBox()
  if (box === null) throw new Error(`${selector} has no box`)
  return box
}
