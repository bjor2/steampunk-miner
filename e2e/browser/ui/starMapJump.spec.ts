/**
 * Planet 3 reachable (ticket 793): on a 1440x900 desktop a fresh save seeded to planet 2 with
 * money opens the star map from the bay footer's Star map with a click, buys each hop's fuel
 * shortfall, jumps with two presses and has control on the new planet within 2 s, from P2 to P3,
 * P3 to P4 and P4 to P5. No "End of the slice" renders at P2, P3 or P5 with the core complete, and
 * a planet the wallet cannot fuel stays on the map dimmed with its shortfall, its Jump refused on
 * the screen with no command sent. The goldens (#793) are the open map with its Jumps and Buy fuel
 * on the four reference phones (#484's cells) and on desktop, each control at least 48 px; written
 * to `docs/ui/screens/<cell>/star-map-jump.jpg` under `npm run ui:screens:update`, never compared.
 * The phones' tapped run is `e2e/browser/mobile/starMapJump.spec.ts`. State through the DOM and
 * `steampunkDebug`, never pixels.
 */
import { expect, test, type Page } from '@playwright/test'
import { STAR_MAP_FOCUS_PANEL, starMapJumpIdOf } from '../../../src/systems/views/starMapControlIds'
import type { StarMapControls } from '../../../src/systems/views/starMapControls'
import type { StarMapView } from '../../../src/systems/views/starMapView'
import { UI_IDS } from '../../../src/ui/ids'
import { starMapPlanetIdOf, STAR_MAP_UI_IDS } from '../../../src/ui/starMap/starMapIds'
import { openGame, type HudLayoutCell } from '../hud/hudLayoutHelpers'
import { dockAt } from '../screens/screenHelpers'
import {
  buyFuelAndJumpTo,
  CLICK,
  JUMP_TO_CONTROL_MS,
  openStarMapFromTheBay,
  PRESS_AND_FRAME_SLACK_MS,
  seedPlanetTwoAtTheSellBay,
  TAP,
} from '../starMapJumps'

/** Software WebGL on a loaded box is slow; this is a wait, not a judgement. */
const TEST_TIMEOUT_MS = 300_000
const JPEG_QUALITY = 80
/** The panel's shutter and the rows' layout, settled before a shot. */
const SETTLE_MS = 400
/** The ticket's floor for every control, on touch and on desktop alike. */
const CONTROL_MIN_PX = 48
const END_OF_SLICE = 'End of the slice'

const DESKTOP: HudLayoutCell = {
  name: 'desktop-1440x900',
  viewport: { width: 1440, height: 900 },
  isTouch: false,
  isTvMode: false,
  floor: null,
}

/** The four reference phones (#484), upright and on their side. */
const PHONES: readonly HudLayoutCell[] = [
  { name: 'phone-portrait', viewport: { width: 390, height: 844 } },
  { name: 'pixel-portrait', viewport: { width: 412, height: 915 } },
  { name: 'phone-landscape', viewport: { width: 844, height: 390 } },
  { name: 'pixel-landscape', viewport: { width: 915, height: 412 } },
].map((phone) => ({ ...phone, isTouch: true, isTvMode: false, floor: null }))

test.describe(`star map jumps (ticket 793): ${DESKTOP.name}`, () => {
  test.use({ viewport: DESKTOP.viewport, isMobile: false, hasTouch: false, deviceScaleFactor: 1 })

  test('buys the fuel and jumps from P2 to P3, P4 and P5, each with control within 2 s', async ({
    page,
  }) => {
    test.setTimeout(TEST_TIMEOUT_MS)
    const errors = await openPlainGame(page, DESKTOP)
    await seedPlanetTwoAtTheSellBay(page)
    for (const place of [3, 4, 5]) {
      await openStarMapFromTheBay(page, CLICK)
      const elapsed = await buyFuelAndJumpTo(page, place, CLICK)
      test
        .info()
        .annotations.push({ type: 'jump-to-control', description: `P${place}: ${elapsed} ms` })
      expect(elapsed).toBeLessThanOrEqual(JUMP_TO_CONTROL_MS + PRESS_AND_FRAME_SLACK_MS)
    }
    expect(errors).toEqual([])
  })

  test('shows no end-of-slice text at P2, P3 or P5 with the core complete, only the Star map', async ({
    page,
  }) => {
    test.setTimeout(TEST_TIMEOUT_MS)
    const errors = await openPlainGame(page, DESKTOP)
    for (const planet of [2, 3, 5]) {
      await completeTheCoreOn(page, planet)
      await expect(page.getByTestId(UI_IDS.platformStarMap)).toBeVisible()
      await expect(page.getByTestId('platform-travel')).toHaveCount(0)
      await expect(page.getByText(END_OF_SLICE)).toHaveCount(0)
    }
    expect(errors).toEqual([])
  })

  test('keeps a planet the wallet cannot fuel dimmed with its shortfall, its Jump refused with no command sent', async ({
    page,
  }) => {
    test.setTimeout(TEST_TIMEOUT_MS)
    const errors = await openPlainGame(page, DESKTOP)
    await page.evaluate(() => window.steampunkDebug!.setPlanet(2))
    await dockAt(page, 'sell')
    await openStarMapFromTheBay(page, CLICK)
    const dimmed = (await readStarMap(page)).planets.find((planet) => planet.isDimmed)
    expect(dimmed, 'an empty wallet cannot fuel the far end of the system').toBeDefined()
    const row = page.getByTestId(starMapPlanetIdOf(dimmed!.place))
    await expect(row).toHaveAttribute('data-dimmed', 'true')
    await expect(row).toContainText(/short \d+/)
    const jump = page.getByTestId(starMapJumpIdOf(dimmed!.place))
    await expect(jump).toBeDisabled()
    await expect(jump).toHaveAttribute('data-reason', 'fuel_short')
    const linesBefore = await jumpLinesOf(page)
    await jump.click({ force: true })
    expect(await jumpLinesOf(page)).toEqual(linesBefore)
    expect(errors).toEqual([])
  })
})

for (const cell of [...PHONES, DESKTOP]) {
  test.describe(`star map jump golden (ticket 793): ${cell.name}`, () => {
    test.use({
      viewport: cell.viewport,
      isMobile: cell.isTouch,
      hasTouch: cell.isTouch,
      deviceScaleFactor: 1,
    })

    test('draws the open map with every Jump and Buy fuel, each control at least 48 px', async ({
      page,
    }) => {
      test.setTimeout(TEST_TIMEOUT_MS)
      const errors = await openPlainGame(page, cell)
      await seedPlanetTwoAtTheSellBay(page)
      await openStarMapFromTheBay(page, cell.isTouch ? TAP : CLICK)
      await shoot(page, cell, 'star-map-jump')
      const controls = await readControls(page)
      expect(controls.buttons.length).toBeGreaterThan(controls.planets.length)
      expect(await undersizedControlsOf(page, controls)).toEqual([])
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

/** On `planet` with every fragment of its core in the bay, docked at the Sell bay. */
async function completeTheCoreOn(page: Page, planet: number): Promise<void> {
  await page.evaluate((index) => {
    const debug = window.steampunkDebug!
    const moved = debug.setPlanet(index)
    if (!moved.ok) throw new Error(moved.problems.join('; '))
    const sell = debug.ui.getSellBayModel()
    if (!sell.ok) throw new Error(sell.problems.join('; '))
    const needed = Number.parseInt(sell.model.header.coreBay.text.split(' / ')[1], 10)
    const filled = debug.setCoreFragments(needed)
    if (!filled.ok) throw new Error(filled.problems.join('; '))
  }, planet)
  await dockAt(page, 'sell')
}

function readStarMap(page: Page): Promise<StarMapView> {
  return page.evaluate(() => {
    const result = window.steampunkDebug!.ui.getStarMapModel()
    if (!result.ok) throw new Error(result.problems.join('; '))
    return result.model
  })
}

function readControls(page: Page): Promise<StarMapControls> {
  return page.evaluate(() => {
    const result = window.steampunkDebug!.ui.getStarMapControls()
    if (!result.ok) throw new Error(result.problems.join('; '))
    return result.model
  })
}

/** The run log's jump requests and their answers: a refused press on the screen adds none. */
function jumpLinesOf(page: Page): Promise<string[]> {
  return page.evaluate(() =>
    window.steampunkRunLog!()
      .split('\n')
      .filter((line) => line.includes('jumpToPlanet') || line.includes('"travel_started"')),
  )
}

/** The map's controls drawn under 48 px wide or tall, by id. */
function undersizedControlsOf(page: Page, controls: StarMapControls): Promise<string[]> {
  const ids = controls.focusStops
    .filter((stop) => stop.panel === STAR_MAP_FOCUS_PANEL)
    .map((stop) => stop.id)
  return page.evaluate(
    ({ testIds, minPx, panelId }) =>
      testIds.filter((id) => {
        const box = document
          .querySelector(`[data-testid="${panelId}"] [data-testid="${id}"]`)
          ?.getBoundingClientRect()
        return box === undefined || box.width < minPx || box.height < minPx
      }),
    { testIds: ids, minPx: CONTROL_MIN_PX, panelId: STAR_MAP_UI_IDS.starMapPanel },
  )
}

/** Written before any assertion, so a failing layout leaves its picture behind. */
async function shoot(page: Page, cell: HudLayoutCell, shot: string): Promise<void> {
  await page.waitForTimeout(SETTLE_MS)
  const path = process.env.UPDATE_UI_SCREENS
    ? `docs/ui/screens/${cell.name}/${shot}.jpg`
    : test.info().outputPath(`${shot}.jpg`)
  await page.screenshot({ path, type: 'jpeg', quality: JPEG_QUALITY })
  await test.info().attach(shot, { path, contentType: 'image/jpeg' })
}
