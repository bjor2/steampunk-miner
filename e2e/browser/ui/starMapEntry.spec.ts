/**
 * The star map's way in (ticket 792): Bjor could not find the map on his phone. Right after New
 * Game, with no touch yet, a phone shows a labelled "Star map" button fully on screen with nothing
 * over it, and one tap opens the map; desktop's strip button shows "Star map" and its M tag inside
 * the viewport, and a click opens the panel. The first-time hint rings the button on both layouts,
 * and no HUD box overlaps another. State through the DOM and `steampunkDebug` only, never pixels.
 */
import { expect, test, type Page } from '@playwright/test'
import { UI_IDS } from '../../../src/ui/ids'
import { STAR_MAP_UI_IDS } from '../../../src/ui/starMap/starMapIds'
import { openGame, overlappingPairs, type HudLayoutCell } from '../hud/hudLayoutHelpers'

/** Software WebGL on a loaded box is slow; this is a wait, not a judgement. */
const TEST_TIMEOUT_MS = 240_000
const PANEL = STAR_MAP_UI_IDS.starMapPanel
const PHONE_BUTTON = UI_IDS.hudPhoneStarMapButton
const DESKTOP_BUTTON = UI_IDS.hudStarMapButton

/** iPhone 13 and Pixel 7, either way up (the ticket's four phone cells). */
const PHONE_VIEWPORTS = [
  { name: 'iphone-13-portrait', width: 390, height: 844 },
  { name: 'iphone-13-landscape', width: 844, height: 390 },
  { name: 'pixel-7-portrait', width: 412, height: 915 },
  { name: 'pixel-7-landscape', width: 915, height: 412 },
]

const DESKTOP_VIEWPORTS = [
  { name: 'desktop-1440x900', width: 1440, height: 900 },
  { name: 'desktop-1920x1080', width: 1920, height: 1080 },
]

/** A player's launch: the title menu, New Game, and no touch or key after it. */
async function startNewGame(page: Page, buttonTestId: string): Promise<void> {
  await page.goto('/')
  await page.getByRole('button', { name: 'New Game' }).click({ timeout: 120_000 })
  await expect(page.getByTestId(buttonTestId)).toBeVisible({ timeout: 60_000 })
}

/** The button's box lies inside the viewport, and the element at its centre is the button. */
function placeOf(page: Page, testId: string) {
  return page.evaluate((id) => {
    const button = document.querySelector(`[data-testid="${id}"]`)
    if (!button) return null
    const box = button.getBoundingClientRect()
    const top = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2)
    return {
      isInViewport:
        box.left >= 0 &&
        box.top >= 0 &&
        box.right <= window.innerWidth &&
        box.bottom <= window.innerHeight,
      isOnTop: top !== null && button.contains(top),
      text: button.textContent ?? '',
    }
  }, testId)
}

function cellOf(viewport: { name: string; width: number; height: number }, isTouch: boolean) {
  const cell: HudLayoutCell = {
    name: viewport.name,
    viewport: { width: viewport.width, height: viewport.height },
    isTouch,
    isTvMode: false,
    floor: null,
  }
  return cell
}

async function showStarMapHint(page: Page): Promise<void> {
  await page.evaluate(() => {
    const result = window.steampunkDebug!.ui.showHint('hint_star_map')
    if (!result.ok) throw new Error(result.problems.join('; '))
  })
}

for (const viewport of PHONE_VIEWPORTS) {
  test.describe(`star map button (ticket 792): ${viewport.name}`, () => {
    test.use({
      viewport: { width: viewport.width, height: viewport.height },
      isMobile: true,
      hasTouch: true,
    })

    test('shows a labelled star map button before any touch, and one tap opens the map', async ({
      page,
    }) => {
      test.setTimeout(TEST_TIMEOUT_MS)
      await startNewGame(page, PHONE_BUTTON)
      const place = await placeOf(page, PHONE_BUTTON)
      expect(place).toMatchObject({ isInViewport: true, isOnTop: true })
      expect(place?.text).toContain('Star map')
      await page.getByTestId(PHONE_BUTTON).tap()
      await expect(page.getByTestId(PANEL)).toBeVisible()
      await expect(page.getByTestId(PANEL)).toHaveAttribute('data-placement', 'full')
    })

    test('rings the button while its first-time hint is up, with no HUD box overlapping', async ({
      page,
    }) => {
      test.setTimeout(TEST_TIMEOUT_MS)
      const errors = await openGame(page, cellOf(viewport, true))
      await showStarMapHint(page)
      await expect(page.getByTestId(PHONE_BUTTON)).toHaveAttribute('data-hinted', 'true')
      expect(await overlappingPairs(page)).toEqual([])
      await page.getByTestId(PHONE_BUTTON).tap()
      await expect(page.getByTestId(PANEL)).toBeVisible()
      await page.locator(`[data-testid="${PANEL}"] [data-sheet-close]`).tap()
      await expect(page.getByTestId(PHONE_BUTTON)).not.toHaveAttribute('data-hinted', 'true')
      expect(errors).toEqual([])
    })
  })
}

for (const viewport of DESKTOP_VIEWPORTS) {
  test.describe(`star map button (ticket 792): ${viewport.name}`, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height } })

    test('shows "Star map" and M inside the viewport, and a click opens the panel', async ({
      page,
    }) => {
      test.setTimeout(TEST_TIMEOUT_MS)
      await startNewGame(page, DESKTOP_BUTTON)
      const place = await placeOf(page, DESKTOP_BUTTON)
      expect(place).toMatchObject({ isInViewport: true, isOnTop: true })
      expect(place?.text).toContain('Star map')
      await expect(
        page.locator(`[data-testid="${DESKTOP_BUTTON}"] [data-key-tag="M"]`),
      ).toBeVisible()
      await page.getByTestId(DESKTOP_BUTTON).click()
      await expect(page.getByTestId(PANEL)).toBeVisible()
    })

    test('rings the strip button while its first-time hint is up', async ({ page }) => {
      test.setTimeout(TEST_TIMEOUT_MS)
      const errors = await openGame(page, cellOf(viewport, false))
      await showStarMapHint(page)
      await expect(page.getByTestId(DESKTOP_BUTTON)).toHaveAttribute('data-hinted', 'true')
      expect(await overlappingPairs(page)).toEqual([])
      expect(errors).toEqual([])
    })
  })
}
