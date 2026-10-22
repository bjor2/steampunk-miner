/**
 * The UI screenshot suite (spec #678, ticket 689): at 360x640 and 390x844 held upright and at
 * 1280x800 and 1440x900 (desktop is first-class, GD lock 21 Oct), the HUD on the surface, with
 * money at 1e15 (ticket 684) and while drilling, the brass gauge cluster at its widest on P41 on
 * the surface and deep (ticket 716), and every sheet of `uiShotSheets.ts`. Each shot is written first, for review by eye
 * (`npm run ui:screens:update` puts them in `docs/ui/screens/<cell>/`), then the suite fails on
 * text that overflows, a tap target under 44 px, text under 14 px, the HUD over its coverage
 * budget (12% / 8%, the #682 overlay's report) or anything in the middle band. The shots are never
 * compared (rulebook section 5); the failures are geometry read through the DOM and
 * `steampunkDebug`.
 */
import { expect, test, type Page } from '@playwright/test'
import { openGame } from '../hud/hudLayoutHelpers'
import { startDiggingDown } from '../screens/screenHelpers'
import { UI_SHOT_CELLS, type UiShotCell } from './uiShotCells'
import {
  hudCoverageOf,
  hudFindingsOf,
  NO_HUD_FINDINGS,
  NO_SHEET_FINDINGS,
  sheetFindingsOf,
} from './uiShotFindings'
import { UI_SHEETS, undock } from './uiShotSheets'
import { UI_IDS } from '../../../src/ui/ids'

/** Software WebGL on a loaded box is slow; this is a wait, not a judgement. */
const TEST_TIMEOUT_MS = 180_000
const JPEG_QUALITY = 80
/** Two tiles down is drilling, as the compact HUD spec (#500) counts it. */
const DRILLED_TILES = 2
const DRILL_TIMEOUT_MS = 60_000
/** A sheet's shutter (`motion.durationsMs.sheet` 200 ms) and a needle's ease, settled. */
const SETTLE_MS = 400

for (const cell of UI_SHOT_CELLS) {
  test.describe(`UI screenshot suite (ticket 689): ${cell.name}`, () => {
    test.use({
      viewport: cell.viewport,
      isMobile: cell.isTouch,
      hasTouch: cell.isTouch,
      deviceScaleFactor: 1,
    })

    test('keeps the HUD on the surface within its budget, out of the band, unspilled and tappable', async ({
      page,
    }) => {
      test.setTimeout(TEST_TIMEOUT_MS)
      const errors = await openPlainGame(page, cell)
      await undock(page)
      await shootAndLogCoverage(page, cell, 'hud-surface')
      expect(await hudFindingsOf(page)).toEqual(NO_HUD_FINDINGS)
      expect(errors).toEqual([])
    })

    test('keeps the HUD while drilling within its budget, out of the band, unspilled and tappable', async ({
      page,
    }) => {
      test.setTimeout(TEST_TIMEOUT_MS)
      const errors = await openPlainGame(page, cell)
      await undock(page)
      await startDiggingDown(page)
      await waitForDepth(page, DRILLED_TILES)
      await shootAndLogCoverage(page, cell, 'hud-dig')
      expect(await hudFindingsOf(page)).toEqual(NO_HUD_FINDINGS)
      expect(errors).toEqual([])
    })

    // Ticket 684's done-when: the strip fits at 360 px with money at 1e15 on the odometer.
    test('fits the strip with money at 1e15 and its chip, within budget and unspilled', async ({
      page,
    }) => {
      test.setTimeout(TEST_TIMEOUT_MS)
      const errors = await openPlainGame(page, cell)
      await undock(page)
      await page.evaluate(() => {
        const result = window.steampunkDebug!.giveMoney('1e15')
        if (!result.ok) throw new Error(result.problems.join('; '))
      })
      await expect(page.getByTestId(UI_IDS.hudStripMoney)).toHaveText('1.00Qa')
      await expect(page.getByTestId(UI_IDS.hudNextUpgrade)).toBeVisible()
      await shootAndLogCoverage(page, cell, 'hud-surface-1e15')
      expect(await hudFindingsOf(page)).toEqual(NO_HUD_FINDINGS)
      expect(errors).toEqual([])
    })

    // Ticket 716: the gauge cluster's goldens with every readout at its widest, at P41 (HS).
    test('fits the gauge cluster at its widest on P41, on the surface and deep', async ({
      page,
    }) => {
      test.setTimeout(TEST_TIMEOUT_MS)
      const errors = await openPlainGame(page, cell)
      await undock(page)
      await runDebug(page, WIDEST_P41)
      await expect(page.getByTestId(UI_IDS.hudStripMoney)).toHaveText('1.00Qa')
      await expect(page.getByTestId('hud-dial-hull')).toHaveAttribute('data-zone', 'red')
      await shootAndLogCoverage(page, cell, 'hud-dials-surface')
      await expectStripUnspilled(page)
      await runDebug(page, [['teleportToDepth', DEEP_BP]])
      await expect(page.getByTestId(UI_IDS.hudStripDepth)).toBeVisible()
      await expect(page.locator('[data-testid="hud-dial-depth"] [data-mark]')).toHaveCount(5)
      await shootAndLogCoverage(page, cell, 'hud-dials-deep')
      await expectStripUnspilled(page)
      if (cell.layout === 'desktop') await expectNumbersFixedWidth(page)
      expect(await hudFindingsOf(page)).toEqual(NO_HUD_FINDINGS)
      expect(errors).toEqual([])
    })

    for (const sheet of UI_SHEETS) {
      test(`fits the ${sheet.shot} sheet with no overflow, no target under 44 px and no text under 14 px`, async ({
        page,
      }) => {
        test.setTimeout(TEST_TIMEOUT_MS)
        const errors = await openPlainGame(page, cell)
        await sheet.open(page)
        await shoot(page, cell, sheet.shot)
        expect(await sheetFindingsOf(page, sheet)).toEqual(NO_SHEET_FINDINGS)
        expect(errors).toEqual([])
      })
    }
  })
}

/** P41 (past the planet rows), money at 1e15 and the hull and fuel nearly gone: red dials. */
const WIDEST_P41: readonly DebugCall[] = [
  ['setPlanet', 41],
  ['giveMoney', '1e15'],
  ['setHull', '1'],
  ['setEnergy', '1'],
]
/** Nine tenths of the way to the centre, past every band mark: the depth reads in km. */
const DEEP_BP = 9000

type DebugCall = readonly [
  name: 'setPlanet' | 'giveMoney' | 'setHull' | 'setEnergy' | 'teleportToDepth',
  value: number | string,
]

async function runDebug(page: Page, calls: readonly DebugCall[]): Promise<void> {
  await page.evaluate((list) => {
    const debug = window.steampunkDebug! as unknown as Record<
      string,
      (value: unknown) => { ok: boolean; problems?: string[] }
    >
    for (const [name, value] of list) {
      const result = debug[name](value)
      if (!result.ok) throw new Error(`${name}: ${(result.problems ?? []).join('; ')}`)
    }
  }, calls)
}

/** One line: nothing on the strip runs past its box (VS: the worst case never reflows). */
async function expectStripUnspilled(page: Page): Promise<void> {
  const strip = page.locator('[data-hud="strip"]')
  const { scroll, client } = await strip.evaluate((element) => ({
    scroll: element.scrollWidth,
    client: element.clientWidth,
  }))
  expect(scroll).toBeLessThanOrEqual(client)
}

/** A hover reveals each dial's number in a tag as wide as the widest, so no dial's is wider. */
async function expectNumbersFixedWidth(page: Page): Promise<void> {
  const widths: number[] = []
  for (const dial of await page.locator('[data-dial]').all()) {
    await dial.hover()
    const id = await dial.getAttribute('data-dial')
    const number = page.getByTestId(`hud-dial-number-${id}`)
    await expect(number).toBeVisible()
    widths.push(await number.evaluate((element) => element.getBoundingClientRect().width))
  }
  expect(widths.length).toBeGreaterThan(0)
  expect(Math.max(...widths) - Math.min(...widths)).toBeLessThanOrEqual(1)
}

/** The debug build with the opening transmission taken down and, on touch, the controls back. */
async function openPlainGame(page: Page, cell: UiShotCell): Promise<string[]> {
  const errors = await openGame(page, cell)
  await page.keyboard.press('KeyH')
  if (cell.isTouch) await page.touchscreen.tap(cell.viewport.width / 2, cell.viewport.height / 2)
  return errors
}

async function waitForDepth(page: Page, tiles: number): Promise<void> {
  await expect
    .poll(() => depthTilesOf(page), { message: 'the rig drills down', timeout: DRILL_TIMEOUT_MS })
    .toBeGreaterThanOrEqual(tiles)
}

function depthTilesOf(page: Page): Promise<number> {
  return page.evaluate(() => {
    const result = window.steampunkDebug!.ui.getHudModel()
    return result.ok ? result.model.depth.depthTiles : 0
  })
}

/** The HUD shot, with the measured share beside it in the report whether or not it passes. */
async function shootAndLogCoverage(page: Page, cell: UiShotCell, shot: string): Promise<void> {
  await shoot(page, cell, shot)
  const report = await hudCoverageOf(page)
  test.info().annotations.push({
    type: 'hud-coverage',
    description: `${cell.name} ${shot}: ${report.measuredPercent}% of ${report.budgetPercent}%, in band [${report.bandIntruderIds.join(', ')}]`,
  })
}

/** Written before any assertion, so a failing layout leaves its picture behind. */
async function shoot(page: Page, cell: UiShotCell, shot: string): Promise<void> {
  await page.waitForTimeout(SETTLE_MS)
  const path = process.env.UPDATE_UI_SCREENS
    ? `docs/ui/screens/${cell.name}/${shot}.jpg`
    : test.info().outputPath(`${shot}.jpg`)
  await page.screenshot({ path, type: 'jpeg', quality: JPEG_QUALITY })
  await test.info().attach(shot, { path, contentType: 'image/jpeg' })
}
