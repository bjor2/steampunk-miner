/**
 * Cargo and saves on the base sheet (spec #678, ticket 688) at a phone (360x640) and a desktop
 * (1280x800) cell. The Sell bay's Hold row opens the Hold, whose Sell cards are the pad's and the
 * keys' focus stops and are greyed while the authority would refuse the sale; the Hold and the
 * Ledger sit on the bar together. The pause menu's Save game opens the Ledger on the sheet: the
 * pause plate gives way, the world stays held, the save slots draw inside the sheet, Close steps
 * back to the pause menu's first page, and picking the Hold from the bar resumes. Geometry and
 * state through the DOM and `steampunkDebug` only, never pixels.
 */
import { expect, test, type Page } from '@playwright/test'
import { UI_ID_TEMPLATES, UI_IDS } from '../../../src/ui/ids'
import { SHEET_UI_IDS } from '../../../src/ui/sheet/sheetIds'
import { openGame } from '../hud/hudLayoutHelpers'
import { UI_SHOT_CELLS } from './uiShotCells'
import { openHold, openLedger } from './uiShotSheets'

/** Software WebGL on a loaded box is slow; this is a wait, not a judgement. */
const TEST_TIMEOUT_MS = 180_000
/** Software GL draws a frame in a few hundred ms, so the held step gets several frames to slip. */
const HELD_STEP_WAIT_MS = 1_000
const CELLS = UI_SHOT_CELLS.filter((cell) =>
  ['phone-360x640', 'desktop-1280x800'].includes(cell.name),
)
const SELL_ALL = `[data-testid="${UI_IDS.holdSellAll}"]`

for (const cell of CELLS) {
  test.describe(`hold and ledger on the sheet (ticket 688): ${cell.name}`, () => {
    test.use({
      viewport: cell.viewport,
      isMobile: cell.isTouch,
      hasTouch: cell.isTouch,
      deviceScaleFactor: 1,
    })

    test('opens the Hold from the Sell bay row, beside the Ledger on the bar', async ({ page }) => {
      test.setTimeout(TEST_TIMEOUT_MS)
      const errors = await openGame(page, cell)
      await openHold(page)
      const sheet = await readSheet(page)
      expect(sheet.openTabId).toBe('hold')
      expect(sheet.shownTabIds).toEqual(expect.arrayContaining(['hold', 'ledger']))
      await expect(page.locator(SELL_ALL)).toBeVisible()
      // A fresh game holds no ore, so the authority refuses the sale and the card is greyed.
      await expect(page.locator(SELL_ALL)).toHaveAttribute('data-muted', 'true')
      await tap(page, 'ui_down')
      await expect(page.locator(SELL_ALL)).toHaveAttribute('data-focused', 'true')
      await tap(page, 'ui_cancel')
      await expect(page.getByTestId(SHEET_UI_IDS.baseSheet)).toHaveCount(0)
      await expect(page.getByTestId(UI_IDS.sellbayHold)).toBeVisible()
      expect(errors).toEqual([])
    })

    test('draws the pause save page as the Ledger, holding the world, and Close steps back', async ({
      page,
    }) => {
      test.setTimeout(TEST_TIMEOUT_MS)
      const errors = await openGame(page, cell)
      await openLedger(page)
      expect((await readSheet(page)).openTabId).toBe('ledger')
      await expect(page.getByTestId(UI_IDS.pauseMenu)).toHaveCount(0)
      const sheet = page.getByTestId(SHEET_UI_IDS.baseSheet)
      await expect(sheet.getByTestId(UI_ID_TEMPLATES.pauseSlot('slot-1'))).toBeVisible()
      const held = await tickNow(page)
      await page.waitForTimeout(HELD_STEP_WAIT_MS)
      expect(await tickNow(page)).toBe(held)
      await page.locator('[data-sheet-close]').click()
      await expect(page.getByTestId(UI_IDS.pauseMenu)).toHaveAttribute('data-page', 'main')
      await expect(page.getByTestId(SHEET_UI_IDS.baseSheet)).toHaveCount(0)
      expect(errors).toEqual([])
    })

    test('leaves the pause menu when the Hold is picked from the Ledger', async ({ page }) => {
      test.setTimeout(TEST_TIMEOUT_MS)
      const errors = await openGame(page, cell)
      await openLedger(page)
      await page.locator('[data-sheet-tab="hold"]').click()
      await expect(page.locator(SELL_ALL)).toBeVisible()
      expect((await readSheet(page)).openTabId).toBe('hold')
      const pause = await page.evaluate(() => window.steampunkDebug!.ui.getPauseMenuModel())
      expect(pause.ok && pause.model).toBeNull()
      expect(errors).toEqual([])
    })
  })
}

async function readSheet(page: Page) {
  return page.evaluate(() => {
    const result = window.steampunkDebug!.ui.getSheet()
    if (!result.ok) throw new Error(result.problems.join('; '))
    return result.sheet
  })
}

function tap(page: Page, actionId: string): Promise<void> {
  return page.evaluate((action) => {
    const result = window.steampunkDebug!.input.tap(action)
    if (!result.ok) throw new Error(result.problems.join('; '))
  }, actionId)
}

function tickNow(page: Page): Promise<number> {
  return page.evaluate(() => {
    const result = window.steampunkDebug!.snapshot()
    if (!result.ok) throw new Error(result.problems.join('; '))
    return result.snapshot.tick
  })
}
