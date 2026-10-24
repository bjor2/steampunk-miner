/**
 * The star map carousel (ticket 796; Bjor, 24 Oct: "swipe / next-previous buttons to switch between
 * them ... when going between them we kind of move on the solar map") on 1440x900 and 1920x1080,
 * docked at the Sell bay: Next and Previous step, → and ← step, a click on a planet of the system
 * strip shows it, and each step moves the selected marker and pans the strip toward it. Jump on a
 * shown affordable planet jumps after ticket 793's confirm. Under reduced motion the pan is a cut
 * and the selection still moves. A planet the wallet cannot fuel is shown dimmed, never skipped.
 *
 * The goldens: the carousel on the four reference phones (#484's cells) and 1440x900, at P1 (the
 * planet the session is on), at P3 shown (affordable) and at P5 shown (dimmed with its shortfall),
 * written to `docs/ui/screens/<cell>/star-map-carousel-p<n>.jpg` under `npm run ui:screens:update`,
 * never compared. The phones' swipes are `e2e/browser/mobile/starMapCarousel.spec.ts`. State
 * through the DOM and `steampunkDebug`, never pixels.
 */
import { expect, test, type Page } from '@playwright/test'
import { starMapBuyFuelIdOf, starMapJumpIdOf } from '../../../src/systems/views/starMapControlIds'
import type { StarMapView } from '../../../src/systems/views/starMapView'
import { UI_IDS } from '../../../src/ui/ids'
import {
  starMapDotIdOf,
  starMapPlanetIdOf,
  STAR_MAP_UI_IDS,
} from '../../../src/ui/starMap/starMapIds'
import { openGame, type HudLayoutCell } from '../hud/hudLayoutHelpers'
import { dockAt } from '../screens/screenHelpers'
import {
  expectShownPlace,
  expectStepOutward,
  panOffsetOf,
  panTransitionSecondsOf,
  readCarousel,
  selectedMarkerXOf,
  stripPlaceOf,
} from '../starMapCarousel'
import {
  CLICK,
  JUMP_TO_CONTROL_MS,
  openStarMapFromTheBay,
  PRESS_AND_FRAME_SLACK_MS,
  seedPlanetTwoAtTheSellBay,
  TAP,
  waitForControlOn,
} from '../starMapJumps'

/** Software WebGL on a loaded box is slow; this is a wait, not a judgement. */
const TEST_TIMEOUT_MS = 300_000
const JPEG_QUALITY = 80
/** The panel's shutter, the pan and the hero's crossfade, settled before a shot. */
const SETTLE_MS = 700

const DESKTOPS: readonly HudLayoutCell[] = [
  { name: 'desktop-1440x900', width: 1440, height: 900 },
  { name: 'desktop-1920x1080', width: 1920, height: 1080 },
].map(({ name, width, height }) => ({
  name,
  viewport: { width, height },
  isTouch: false,
  isTvMode: false,
  floor: null,
}))

/** The four reference phones (#484), upright and on their side, as ticket 793's goldens. */
const PHONES: readonly HudLayoutCell[] = [
  { name: 'phone-portrait', viewport: { width: 390, height: 844 } },
  { name: 'pixel-portrait', viewport: { width: 412, height: 915 } },
  { name: 'phone-landscape', viewport: { width: 844, height: 390 } },
  { name: 'pixel-landscape', viewport: { width: 915, height: 412 } },
].map((phone) => ({ ...phone, isTouch: true, isTvMode: false, floor: null }))

for (const cell of DESKTOPS) {
  test.describe(`star map carousel (ticket 796): ${cell.name}`, () => {
    test.use({ viewport: cell.viewport, isMobile: false, hasTouch: false, deviceScaleFactor: 1 })

    test('steps with Next, Previous, the arrow keys and a click on the strip, panning toward the shown planet', async ({
      page,
    }) => {
      test.setTimeout(TEST_TIMEOUT_MS)
      const errors = await openPlainGame(page, cell)
      await dockAt(page, 'sell')
      await openStarMapFromTheBay(page, CLICK)
      await expectShownPlace(page, 1)

      const atOne = await stripPlaceOf(page)
      await page.getByTestId(STAR_MAP_UI_IDS.starMapNext).click()
      await expectShownPlace(page, 2)
      await expectStepOutward(page, atOne)
      await page.getByTestId(STAR_MAP_UI_IDS.starMapPrevious).click()
      await expectShownPlace(page, 1)
      await expect(page.getByTestId(STAR_MAP_UI_IDS.starMapPrevious)).toBeDisabled()

      await page.keyboard.press('ArrowRight')
      await expectShownPlace(page, 2)
      const atTwo = await stripPlaceOf(page)
      await page.keyboard.press('ArrowRight')
      await expectShownPlace(page, 3)
      await expectStepOutward(page, atTwo)
      await page.keyboard.press('ArrowLeft')
      await expectShownPlace(page, 2)

      await page.getByTestId(starMapDotIdOf(5)).click()
      await expectShownPlace(page, 5)
      await expect(page.getByTestId(starMapDotIdOf(5))).toHaveAttribute('data-selected', 'true')
      await expect(page.getByTestId(STAR_MAP_UI_IDS.starMapNext)).toBeDisabled()
      await page.keyboard.press('ArrowRight')
      await expectShownPlace(page, 5)
      expect(errors).toEqual([])
    })

    test("jumps to a shown affordable planet after the Jump's confirm", async ({ page }) => {
      test.setTimeout(TEST_TIMEOUT_MS)
      const errors = await openPlainGame(page, cell)
      await seedPlanetTwoAtTheSellBay(page)
      await openStarMapFromTheBay(page, CLICK)
      await expectShownPlace(page, 2)
      await page.keyboard.press('ArrowRight')
      await expectShownPlace(page, 3)
      await page.getByTestId(starMapBuyFuelIdOf(3)).click()
      const jump = page.getByTestId(starMapJumpIdOf(3))
      await expect(jump).not.toHaveAttribute('data-reason', /.+/)
      await jump.click()
      await expect(jump).toHaveText('Confirm jump')
      const confirmedAt = Date.now()
      await jump.click()
      await waitForControlOn(page, 3)
      expect(Date.now() - confirmedAt).toBeLessThanOrEqual(
        JUMP_TO_CONTROL_MS + PRESS_AND_FRAME_SLACK_MS,
      )
      expect(errors).toEqual([])
    })

    test('cuts the pan under reduced motion while the selection still moves', async ({ page }) => {
      test.setTimeout(TEST_TIMEOUT_MS)
      const errors = await openPlainGame(page, cell)
      await page.evaluate(() => window.steampunkDebug!.ui.setPref('shake', false))
      await dockAt(page, 'sell')
      await openStarMapFromTheBay(page, CLICK)
      expect(await panTransitionSecondsOf(page)).toBe(0)
      const before = await stripPlaceOf(page)
      await page.getByTestId(STAR_MAP_UI_IDS.starMapNext).click()
      await expectShownPlace(page, 2)
      expect(await panOffsetOf(page)).toBeGreaterThan(before.pan)
      expect(await selectedMarkerXOf(page)).toBeGreaterThan(before.marker)
      expect(errors).toEqual([])
    })

    test('shows a planet the wallet cannot fuel dimmed with its numbers, never skipping it', async ({
      page,
    }) => {
      test.setTimeout(TEST_TIMEOUT_MS)
      const errors = await openPlainGame(page, cell)
      await dockAt(page, 'sell')
      await openStarMapFromTheBay(page, CLICK)
      const map = await readStarMap(page)
      const dimmed = map.planets.filter((planet) => planet.isDimmed)
      expect(dimmed.length, 'an empty wallet cannot fuel the far end').toBeGreaterThan(0)
      for (const planet of map.planets.slice(1)) {
        await page.getByTestId(STAR_MAP_UI_IDS.starMapNext).click()
        await expectShownPlace(page, planet.place)
      }
      const far = dimmed[dimmed.length - 1]
      const card = page.getByTestId(starMapPlanetIdOf(far.place))
      await expect(card).toHaveAttribute('data-dimmed', 'true')
      await expect(card).toContainText(far.fuel!.text)
      await expect(card).toContainText(/short \d+/)
      await expect(page.getByTestId(starMapJumpIdOf(far.place))).toBeDisabled()
      await expect(page.getByTestId(starMapDotIdOf(far.place))).toHaveAttribute(
        'data-dimmed',
        'true',
      )
      expect(errors).toEqual([])
    })
  })
}

for (const cell of [...PHONES, DESKTOPS[0]]) {
  test.describe(`star map carousel golden (ticket 796): ${cell.name}`, () => {
    test.use({
      viewport: cell.viewport,
      isMobile: cell.isTouch,
      hasTouch: cell.isTouch,
      deviceScaleFactor: 1,
    })

    test('draws the carousel at P1, at P3 shown and affordable, and at P5 shown and dimmed', async ({
      page,
    }) => {
      test.setTimeout(TEST_TIMEOUT_MS)
      const errors = await openPlainGame(page, cell)
      await dockAt(page, 'sell')
      const press = cell.isTouch ? TAP : CLICK
      await openStarMapFromTheBay(page, press)
      await expectShownPlace(page, 1)
      await expectNameFuelAndJumpInView(page, 1)
      await shoot(page, cell, 'star-map-carousel-p1')

      await givePriceOfShortfall(page, 3)
      await expect.poll(async () => isDimmedAt(await readStarMap(page), 3)).toBe(false)
      expect(isDimmedAt(await readStarMap(page), 5)).toBe(true)
      await press(page.getByTestId(starMapDotIdOf(3)))
      await expectShownPlace(page, 3)
      await expectNameFuelAndJumpInView(page, 3)
      await shoot(page, cell, 'star-map-carousel-p3')

      await press(page.getByTestId(starMapDotIdOf(5)))
      await expectShownPlace(page, 5)
      await expect(page.getByTestId(starMapPlanetIdOf(5))).toHaveAttribute('data-dimmed', 'true')
      await expectNameFuelAndJumpInView(page, 5)
      await shoot(page, cell, 'star-map-carousel-p5')
      expect((await readCarousel(page)).planet.shortfall).not.toBeNull()
      expect(errors).toEqual([])
    })
  })
}

/** The debug build with the opening transmission taken down and, on touch, the controls back. */
async function openPlainGame(page: Page, cell: HudLayoutCell): Promise<string[]> {
  const errors = await openGame(page, cell)
  await page.keyboard.press('KeyK')
  if (cell.isTouch) await page.touchscreen.tap(cell.viewport.width / 2, cell.viewport.height / 2)
  return errors
}

/** The money that buys a planet's fuel shortfall here now: it lights that planet and no further. */
async function givePriceOfShortfall(page: Page, place: number): Promise<void> {
  const map = await readStarMap(page)
  const price = map.planets.find((planet) => planet.place === place)?.shortfall?.price
  if (price === null || price === undefined) throw new Error(`P${place} has no shortfall price`)
  await page.evaluate((amount) => window.steampunkDebug!.giveMoney(amount), price.exact)
}

/**
 * The shown planet's name and fuel, and its Jump on any planet but the session's, inside the
 * viewport: nothing scrolled away and nothing under the HUD strip.
 */
async function expectNameFuelAndJumpInView(page: Page, place: number): Promise<void> {
  const card = page.getByTestId(starMapPlanetIdOf(place))
  await expect(card).toBeInViewport()
  if (place !== 1) await expect(page.getByTestId(starMapJumpIdOf(place))).toBeInViewport()
  const covered = await page.evaluate(
    ({ cardId, stripId }) => {
      const strip = document.querySelector(`[data-testid="${stripId}"]`)?.getBoundingClientRect()
      const box = document.querySelector(`[data-testid="${cardId}"]`)!.getBoundingClientRect()
      const isUnderStrip =
        strip !== undefined && box.top < strip.bottom && box.bottom > strip.top && strip.width > 0
      const isOverlapping = isUnderStrip && box.left < strip.right && box.right > strip.left
      const topmost = document.elementFromPoint(box.left + 8, box.top + 8)
      const isOnTop = topmost !== null && topmost.closest(`[data-testid="${cardId}"]`) !== null
      return isOverlapping || !isOnTop
    },
    { cardId: starMapPlanetIdOf(place), stripId: UI_IDS.hudStrip },
  )
  expect(covered, `P${place}'s card is covered`).toBe(false)
}

function isDimmedAt(map: StarMapView, place: number): boolean {
  return map.planets.find((planet) => planet.place === place)?.isDimmed ?? false
}

function readStarMap(page: Page): Promise<StarMapView> {
  return page.evaluate(() => {
    const result = window.steampunkDebug!.ui.getStarMapModel()
    if (!result.ok) throw new Error(result.problems.join('; '))
    return result.model
  })
}

/** Written before any assertion that follows it, so a failing layout leaves its picture behind. */
async function shoot(page: Page, cell: HudLayoutCell, shot: string): Promise<void> {
  await page.waitForTimeout(SETTLE_MS)
  const path = process.env.UPDATE_UI_SCREENS
    ? `docs/ui/screens/${cell.name}/${shot}.jpg`
    : test.info().outputPath(`${shot}.jpg`)
  await page.screenshot({ path, type: 'jpeg', quality: JPEG_QUALITY })
  await test.info().attach(shot, { path, contentType: 'image/jpeg' })
}
