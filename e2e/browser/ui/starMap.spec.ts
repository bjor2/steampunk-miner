/**
 * The star map UI (ticket 757; the GD lock on #650, Map UX) on a 360x640 phone and a 1280x800
 * desktop, both first-class: one tap on the HUD's star map button (ticket 792) or one M opens it,
 * full screen on the phone and docked beside the view on desktop. Every planet of the system shows
 * its fuel cost, the tank's level and any shortfall, and a planet the player cannot afford is
 * dimmed, never dropped. The rows are judged against `ui.getStarMapModel()`; state through the DOM
 * and `steampunkDebug` only, never pixels.
 */
import { expect, test, type Page } from '@playwright/test'
import type { StarMapView } from '../../../src/systems/views/starMapView'
import { starMapPlanetIdOf, STAR_MAP_UI_IDS } from '../../../src/ui/starMap/starMapIds'
import { UI_IDS } from '../../../src/ui/ids'
import { openGame, type HudLayoutCell } from '../hud/hudLayoutHelpers'
import { undock } from './uiShotSheets'

/** Software WebGL on a loaded box is slow; this is a wait, not a judgement. */
const TEST_TIMEOUT_MS = 240_000
const PANEL = STAR_MAP_UI_IDS.starMapPanel

const PHONE: HudLayoutCell = {
  name: 'phone-360x640',
  viewport: { width: 360, height: 640 },
  isTouch: true,
  isTvMode: false,
  floor: null,
}

const DESKTOP: HudLayoutCell = {
  name: 'desktop-1280x800',
  viewport: { width: 1280, height: 800 },
  isTouch: false,
  isTvMode: false,
  floor: null,
}

test.describe(`star map (ticket 757): ${PHONE.name}`, () => {
  test.use({ viewport: PHONE.viewport, isMobile: true, hasTouch: true, deviceScaleFactor: 1 })

  test('opens full screen in one tap and shows every planet with its cost, tank and shortfall', async ({
    page,
  }) => {
    test.setTimeout(TEST_TIMEOUT_MS)
    const errors = await openGame(page, PHONE)
    await undock(page)
    await page.getByTestId(UI_IDS.hudPhoneStarMapButton).tap()
    await expect(page.getByTestId(PANEL)).toBeVisible()
    await expect(page.getByTestId(PANEL)).toHaveAttribute('data-placement', 'full')
    await expectRowsOfModel(page)
    await page.locator(`[data-testid="${PANEL}"] [data-sheet-close]`).tap()
    await expect(page.getByTestId(PANEL)).toHaveCount(0)
    expect(errors).toEqual([])
  })
})

test.describe(`star map (ticket 757): ${DESKTOP.name}`, () => {
  test.use({ viewport: DESKTOP.viewport, isMobile: false, hasTouch: false, deviceScaleFactor: 1 })

  test('opens docked with one key and shows every planet with its cost, tank and shortfall', async ({
    page,
  }) => {
    test.setTimeout(TEST_TIMEOUT_MS)
    const errors = await openGame(page, DESKTOP)
    await page.keyboard.press('KeyK')
    await undock(page)
    await page.keyboard.press('KeyM')
    await expect(page.getByTestId(PANEL)).toBeVisible()
    await expect(page.getByTestId(PANEL)).toHaveAttribute('data-placement', 'docked')
    await expectRowsOfModel(page)
    expect(errors).toEqual([])
  })

  test('keeps a planet the wallet cannot fuel on the map, dimmed, and lifts the dimming once it can', async ({
    page,
  }) => {
    test.setTimeout(TEST_TIMEOUT_MS)
    const errors = await openGame(page, DESKTOP)
    await page.keyboard.press('KeyK')
    await undock(page)
    await page.keyboard.press('KeyM')
    const dimmed = (await readStarMap(page)).planets.find((planet) => planet.isDimmed)
    expect(dimmed, 'a fresh wallet cannot fuel the far end of the system').toBeDefined()
    const far = page.getByTestId(starMapPlanetIdOf(dimmed!.place))
    await expect(far).toHaveAttribute('data-dimmed', 'true')
    await expect(far).toContainText(dimmed!.fuel!.text)
    await page.evaluate(() => window.steampunkDebug!.giveMoney('1e12'))
    await expect(far).not.toHaveAttribute('data-dimmed', 'true')
    expect(errors).toEqual([])
  })
})

/** Every planet the model lists has its row, its here and dimmed marks and its numbers. */
async function expectRowsOfModel(page: Page): Promise<void> {
  const map = await readStarMap(page)
  await expect(page.getByTestId(STAR_MAP_UI_IDS.starMapTank)).toContainText(map.tank.held.text)
  await expect(page.getByTestId(STAR_MAP_UI_IDS.starMapTank)).toContainText(map.tank.capacity.text)
  for (const planet of map.planets) {
    const row = page.getByTestId(starMapPlanetIdOf(planet.place))
    await expect(row).toContainText(planet.name)
    await expect(row).toContainText(planet.line)
    if (planet.isHere) await expect(row).toHaveAttribute('data-here', 'true')
    if (planet.isDimmed) await expect(row).toHaveAttribute('data-dimmed', 'true')
    else await expect(row).not.toHaveAttribute('data-dimmed', 'true')
    if (planet.fuel !== null) await expect(row).toContainText(planet.fuel.text)
    if (planet.fee !== null) await expect(row).toContainText(planet.fee.text)
  }
}

function readStarMap(page: Page): Promise<StarMapView> {
  return page.evaluate(() => {
    const result = window.steampunkDebug!.ui.getStarMapModel()
    if (!result.ok) throw new Error(result.problems.join('; '))
    return result.model
  })
}
