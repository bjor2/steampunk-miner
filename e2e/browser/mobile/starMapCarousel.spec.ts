/**
 * The star map carousel on a phone (ticket 796; Bjor, 24 Oct: "swipe / next-previous buttons to
 * switch between them ... we kind of move on the solar map"): on the iPhone 13 and Pixel 7 projects,
 * on their side and upright, docked at the Sell bay with the map open from the bay footer, a swipe
 * left across the hero shows the next planet and a swipe right the previous, and the Previous and
 * Next buttons do the same by taps. The shown planet's name, its fuel cost and its Jump stay in
 * view, and each step outward moves the strip's selected marker and pans the strip toward it. The
 * desktop keys, the strip's clicks, the jump, reduced motion and the goldens are
 * `e2e/browser/ui/starMapCarousel.spec.ts`. Emulation, not a device (#482). State through the DOM
 * and `steampunkDebug`, never pixels.
 */
import { expect, test, type Page } from '@playwright/test'
import { starMapJumpIdOf } from '../../../src/systems/views/starMapControlIds'
import { starMapPlanetIdOf, STAR_MAP_UI_IDS } from '../../../src/ui/starMap/starMapIds'
import { currentCell, dockAt, openGame } from '../screens/screenHelpers'
import { expectShownPlace, expectStepOutward, stripPlaceOf, swipeHero } from '../starMapCarousel'
import { openStarMapFromTheBay, TAP } from '../starMapJumps'
import { skipWhereEngineIsMissing } from './mobileHelpers'

/** Software WebGL on a 3x phone screen is slow, WebKit's slower still: a wait, not a judgement. */
const TEST_TIMEOUT_MS = 300_000

type Orientation = 'landscape' | 'portrait'

skipWhereEngineIsMissing()

for (const orientation of ['landscape', 'portrait'] as const) {
  test.describe(`mobile: star map carousel (ticket 796), ${orientation}`, () => {
    test('swipes left to the next planet and right to the previous, the strip panning along', async ({
      page,
    }) => {
      test.setTimeout(TEST_TIMEOUT_MS)
      const errors = await openMapAtTheBay(page, orientation)
      await expectShownPlace(page, 1)

      const atOne = await stripPlaceOf(page)
      await swipeHero(page, 'left')
      await expectShownPlace(page, 2)
      await expectStepOutward(page, atOne)
      await expectNameFuelAndJumpVisible(page, 2)

      const atTwo = await stripPlaceOf(page)
      await swipeHero(page, 'left')
      await expectShownPlace(page, 3)
      await expectStepOutward(page, atTwo)
      await expectNameFuelAndJumpVisible(page, 3)

      await swipeHero(page, 'right')
      await expectShownPlace(page, 2)
      await swipeHero(page, 'right')
      await expectShownPlace(page, 1)
      await swipeHero(page, 'right')
      await expectShownPlace(page, 1)
      expect(errors).toEqual([])
    })

    test('steps with the Previous and Next buttons by taps, each at least 48 px', async ({
      page,
    }) => {
      test.setTimeout(TEST_TIMEOUT_MS)
      const errors = await openMapAtTheBay(page, orientation)
      for (const id of [STAR_MAP_UI_IDS.starMapPrevious, STAR_MAP_UI_IDS.starMapNext]) {
        const box = await page.getByTestId(id).boundingBox()
        expect(Math.min(box?.width ?? 0, box?.height ?? 0)).toBeGreaterThanOrEqual(48)
      }
      const atOne = await stripPlaceOf(page)
      await page.getByTestId(STAR_MAP_UI_IDS.starMapNext).tap()
      await expectShownPlace(page, 2)
      await expectStepOutward(page, atOne)
      await expectNameFuelAndJumpVisible(page, 2)
      await page.getByTestId(STAR_MAP_UI_IDS.starMapNext).tap()
      await expectShownPlace(page, 3)
      await page.getByTestId(STAR_MAP_UI_IDS.starMapPrevious).tap()
      await expectShownPlace(page, 2)
      expect(errors).toEqual([])
    })
  })
}

/** The project's phone turned to `orientation`, docked at the Sell bay with the map open. */
async function openMapAtTheBay(page: Page, orientation: Orientation): Promise<string[]> {
  const cell = currentCell()
  const { width, height } = cell.viewport
  if (orientation === 'portrait') await page.setViewportSize({ width: height, height: width })
  const errors = await openGame(page, cell)
  await page.keyboard.press('KeyK')
  await dockAt(page, 'sell')
  await openStarMapFromTheBay(page, TAP)
  return errors
}

/** The shown planet's name, its fuel cost and its Jump on the screen, none scrolled away. */
async function expectNameFuelAndJumpVisible(page: Page, place: number): Promise<void> {
  const model = await page.evaluate(() => {
    const result = window.steampunkDebug!.ui.getStarMapCarousel()
    if (!result.ok) throw new Error(result.problems.join('; '))
    return result.model
  })
  const card = page.getByTestId(starMapPlanetIdOf(place))
  await expect(card).toBeInViewport()
  await expect(card).toContainText(model.planet.name)
  await expect(card).toContainText(model.planet.fuel!.text)
  await expect(page.getByTestId(starMapJumpIdOf(place))).toBeInViewport()
}
