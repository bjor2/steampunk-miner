/**
 * The desktop layout shell (spec #678, ticket 767, GD lock 23 Oct) at 1280x720, 1280x800, 1920x1080
 * and 2560x1440: the sheet docks beside the view covering at most a quarter of it and shows each
 * card's line unhovered; the camera's lean reaches the half width; the strip keeps the star map's
 * fuel wells and never spills or reflows through the 0 to 1e300 money sweep, upgrade levels at 1,
 * 99, 9999 and 1e6, and on P40, every figure through the shared formatter at 6 characters at most.
 * Geometry and state through the DOM and `steampunkDebug` only, never pixels.
 */
import { expect, test, type Page } from '@playwright/test'
import { UPGRADE_IDS } from '../../../src/systems/economy/economyDefinition'
import { SHEET_UI_IDS } from '../../../src/ui/sheet/sheetIds'
import { DEVICE_UI_IDS } from '../../../src/ui/stage/deviceIds'
import { UI_IDS } from '../../../src/ui/ids'
import { openGame, SLACK_PX, type HudLayoutCell } from '../hud/hudLayoutHelpers'
import {
  hudFindingsOf,
  NO_HUD_FINDINGS,
  NO_SHEET_FINDINGS,
  sheetFindingsOf,
} from './uiShotFindings'
import { openBaseSheet, openUpgradeBay, UI_SHEETS, undock } from './uiShotSheets'

/** Software WebGL on a loaded box is slow; this is a wait, not a judgement. */
const TEST_TIMEOUT_MS = 240_000
/** The shared formatter's widest figure (#681), the glyph aside. */
const FIGURE_CHARS_MAX = 6
const CARD = '[data-sheet-card="example.cards.drill"]'
/** Every 15th power of ten from 1 to 1e300, then the top itself. */
const MONEY_STEPS = Array.from({ length: 21 }, (_, at) => `1e${at * 15}`)
const LEVELS = [1, 99, 9999, 1_000_000]
const P40 = 40

const DESKTOP_CELLS: readonly HudLayoutCell[] = [
  [1280, 720],
  [1280, 800],
  [1920, 1080],
  [2560, 1440],
].map(([width, height]) => ({
  name: `desktop-${width}x${height}`,
  viewport: { width, height },
  isTouch: false,
  isTvMode: false,
  floor: null,
}))

for (const cell of DESKTOP_CELLS) {
  test.describe(`desktop layout shell (ticket 767): ${cell.name}`, () => {
    test.use({ viewport: cell.viewport, isMobile: false, hasTouch: false, deviceScaleFactor: 1 })

    test('docks the sheet in at most a quarter of the play area, every card line shown', async ({
      page,
    }) => {
      test.setTimeout(TEST_TIMEOUT_MS)
      const errors = await openPlainGame(page, cell)
      const wide = await boxOf(page, `[data-testid="${DEVICE_UI_IDS.gameStage}"]`)
      await openBaseSheet(page)
      const sheet = await readSheet(page)
      expect(sheet.placement).toBe('docked')
      expect(sheet.dockWidthPx!).toBeLessThanOrEqual(wide.width / 4)
      const narrow = await boxOf(page, `[data-testid="${DEVICE_UI_IDS.gameStage}"]`)
      expect(Math.abs(wide.width - narrow.width - sheet.dockWidthPx!)).toBeLessThanOrEqual(SLACK_PX)
      await page.mouse.move(narrow.x + narrow.width / 2, narrow.y + narrow.height / 2)
      await expect(page.locator(`${CARD} [data-sheet-card-line]`)).toBeVisible()
      const baseSheet = UI_SHEETS.find((row) => row.shot === 'base-sheet')!
      expect(await sheetFindingsOf(page, baseSheet)).toEqual(NO_SHEET_FINDINGS)
      expect(errors).toEqual([])
    })

    test("spends the screen's spare width on the lean across it", async ({ page }) => {
      test.setTimeout(TEST_TIMEOUT_MS)
      const errors = await openPlainGame(page, cell)
      const view = await page.evaluate(() => {
        const result = window.steampunkDebug!.ui.getCameraView()
        if (!result.ok) throw new Error('no camera view')
        return result.view
      })
      expect(view.leanReach).toBe('width')
      expect(view.groundAheadHorizontalMetres).toBeGreaterThanOrEqual(view.groundAheadMetres)
      expect(errors).toEqual([])
    })

    test('keeps the fuel wells and holds the strip through the 0 to 1e300 money sweep', async ({
      page,
    }) => {
      test.setTimeout(TEST_TIMEOUT_MS)
      const errors = await openPlainGame(page, cell)
      await undock(page)
      await expect(page.getByTestId(UI_IDS.hudFuelTankWell)).toHaveCount(1)
      await expect(page.getByTestId(UI_IDS.hudFuelCostWell)).toHaveCount(1)
      const strip = await boxOf(page, '[data-hud="strip"]')
      for (const amount of MONEY_STEPS) {
        await runDebug(page, [['giveMoney', amount]])
        await expectStripHeld(page, strip)
        const money = (await page.getByTestId(UI_IDS.hudStripMoney).textContent()) ?? ''
        expect(money.length, `${amount} as ${money}`).toBeLessThanOrEqual(FIGURE_CHARS_MAX)
      }
      expect(await hudFindingsOf(page)).toEqual(NO_HUD_FINDINGS)
      expect(errors).toEqual([])
    })

    for (const level of LEVELS) {
      test(`fits the strip and the Outfitter with every track at level ${level}`, async ({
        page,
      }) => {
        test.setTimeout(TEST_TIMEOUT_MS)
        const errors = await openPlainGame(page, cell)
        await undock(page)
        const strip = await boxOf(page, '[data-hud="strip"]')
        await runDebug(
          page,
          UPGRADE_IDS.map((id) => ['setUpgrade', id, level] as const),
        )
        await expectStripHeld(page, strip)
        await openUpgradeBay(page)
        const outfitter = UI_SHEETS.find((row) => row.shot === 'upgrade-bay')!
        expect(await sheetFindingsOf(page, outfitter)).toEqual(NO_SHEET_FINDINGS)
        await expect(page.getByTestId(SHEET_UI_IDS.baseSheet)).toHaveAttribute(
          'data-placement',
          'docked',
        )
        expect(errors).toEqual([])
      })
    }

    test('fits the strip and the HUD on P40', async ({ page }) => {
      test.setTimeout(TEST_TIMEOUT_MS)
      const errors = await openPlainGame(page, cell)
      await undock(page)
      const strip = await boxOf(page, '[data-hud="strip"]')
      await runDebug(page, [
        ['setPlanet', P40],
        ['giveMoney', '1e40'],
      ])
      await expectStripHeld(page, strip)
      expect(await hudFindingsOf(page)).toEqual(NO_HUD_FINDINGS)
      expect(errors).toEqual([])
    })
  })
}

type DebugCall =
  | readonly ['giveMoney', string]
  | readonly ['setPlanet', number]
  | readonly ['setUpgrade', string, number]

async function runDebug(page: Page, calls: readonly DebugCall[]): Promise<void> {
  await page.evaluate((list) => {
    const debug = window.steampunkDebug! as unknown as Record<
      string,
      (...values: unknown[]) => { ok: boolean; problems?: string[] }
    >
    for (const [name, ...values] of list) {
      const result = debug[name](...values)
      if (!result.ok) throw new Error(`${name}: ${(result.problems ?? []).join('; ')}`)
    }
  }, calls)
}

/** The strip keeps its box and nothing on it runs past it: no reflow, no clipping. */
async function expectStripHeld(
  page: Page,
  before: { x: number; width: number; height: number },
): Promise<void> {
  const now = await boxOf(page, '[data-hud="strip"]')
  expect(Math.abs(now.width - before.width)).toBeLessThanOrEqual(SLACK_PX)
  expect(Math.abs(now.height - before.height)).toBeLessThanOrEqual(SLACK_PX)
  const { scroll, client } = await page.locator('[data-hud="strip"]').evaluate((element) => ({
    scroll: element.scrollWidth,
    client: element.clientWidth,
  }))
  expect(scroll).toBeLessThanOrEqual(client)
}

/** The debug build with the opening transmission taken down. */
async function openPlainGame(page: Page, cell: HudLayoutCell): Promise<string[]> {
  const errors = await openGame(page, cell)
  await page.keyboard.press('KeyH')
  return errors
}

async function readSheet(page: Page) {
  return page.evaluate(() => {
    const result = window.steampunkDebug!.ui.getSheet()
    if (!result.ok) throw new Error(result.problems.join('; '))
    return result.sheet
  })
}

async function boxOf(page: Page, selector: string) {
  const box = await page.locator(selector).first().boundingBox()
  if (box === null) throw new Error(`${selector} is not on screen`)
  return box
}
