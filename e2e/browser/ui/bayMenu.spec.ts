/**
 * One menu per building (ticket 734): docking at the Upgrade bay opened the Outfitter sheet over
 * the bay's frame, so one open stacked two menus, the frame hidden behind a phone's full sheet,
 * and play came back only on the second close. Now the sheet a dock opens is that bay's one menu:
 * exactly one sheet is open, nothing waits unseen behind it, and one close (Escape or the sheet's
 * Close) shuts it and leaves the bay. The Sell bay opens its frame alone, and one Escape leaves
 * it. At 360x640 and 1280x800; state through the DOM and `steampunkDebug`, never pixels.
 */
import { expect, test, type Page } from '@playwright/test'
import type { DebugApi } from '../../../src/debug/debugApi'
import { UI_IDS } from '../../../src/systems/views/screenIds'
import { SHEET_UI_IDS } from '../../../src/ui/sheet/sheetIds'
import { openGame } from '../hud/hudLayoutHelpers'
import { UI_SHOT_CELLS, type UiShotCell } from './uiShotCells'

declare global {
  interface Window {
    steampunkDebug?: DebugApi
  }
}

/** Software WebGL on a loaded box is slow; this is a wait, not a judgement. */
const TEST_TIMEOUT_MS = 180_000
const OPEN_TIMEOUT_MS = 30_000
const OUTFITTER_TAB_ID = 'workshop.outfitter'
/** The acceptance's two screens: the 360 px phone and a 1280+ desktop. */
const CELLS = UI_SHOT_CELLS.filter((cell) =>
  ['phone-360x640', 'desktop-1280x800'].includes(cell.name),
)

for (const cell of CELLS) {
  test.describe(`one menu per building (ticket 734): ${cell.name}`, () => {
    test.use({
      viewport: cell.viewport,
      isMobile: cell.isTouch,
      hasTouch: cell.isTouch,
      deviceScaleFactor: 1,
    })

    test('docking at the Upgrade bay opens exactly one menu, and one Escape returns to play', async ({
      page,
    }) => {
      test.setTimeout(TEST_TIMEOUT_MS)
      const errors = await openGame(page, cell)
      await dockAtTheUpgradeBay(page)
      await expectOneBayMenu(page, cell)
      await page.evaluate(() => window.steampunkDebug!.input.tap('ui_cancel'))
      await expectBackInPlay(page)
      expect(errors).toEqual([])
    })

    test('one press of the sheet’s Close shuts the Outfitter and leaves the bay', async ({
      page,
    }) => {
      test.setTimeout(TEST_TIMEOUT_MS)
      const errors = await openGame(page, cell)
      await dockAtTheUpgradeBay(page)
      await expectOneBayMenu(page, cell)
      const close = page.locator(`[data-testid="${SHEET_UI_IDS.baseSheet}"] [data-sheet-close]`)
      if (cell.isTouch) await close.tap()
      else await close.click()
      await expectBackInPlay(page)
      expect(errors).toEqual([])
    })

    test('docking at the Sell bay opens its frame alone, and one Escape returns to play', async ({
      page,
    }) => {
      test.setTimeout(TEST_TIMEOUT_MS)
      const errors = await openGame(page, cell)
      await leaveTheBay(page)
      await dockAt(page, 'sell')
      await expect(page.getByTestId(UI_IDS.platformScreen)).toBeVisible()
      await expect(page.getByTestId(SHEET_UI_IDS.baseSheet)).toHaveCount(0)
      await page.evaluate(() => window.steampunkDebug!.input.tap('ui_cancel'))
      await expectBackInPlay(page)
      expect(errors).toEqual([])
    })
  })
}

/** The game starts docked at the Sell bay: leave it, then dock at the Works. */
async function dockAtTheUpgradeBay(page: Page): Promise<void> {
  await leaveTheBay(page)
  await dockAt(page, 'upgrade')
  await expect(page.getByTestId(SHEET_UI_IDS.outfitterCards)).toBeVisible({
    timeout: OPEN_TIMEOUT_MS,
  })
}

/** One sheet, the bay's menu, and on a phone no bay frame waiting behind it. */
async function expectOneBayMenu(page: Page, cell: UiShotCell): Promise<void> {
  await expect(page.getByTestId(SHEET_UI_IDS.baseSheet)).toHaveCount(1)
  const sheet = await sheetNow(page)
  expect([sheet.openTabId, sheet.isBayMenu]).toEqual([OUTFITTER_TAB_ID, true])
  if (cell.layout === 'phone') await expect(page.getByTestId(UI_IDS.platformScreen)).toBeHidden()
}

async function expectBackInPlay(page: Page): Promise<void> {
  await expect.poll(() => shutterPhase(page), { timeout: OPEN_TIMEOUT_MS }).toBe('closed')
  await expect(page.getByTestId(SHEET_UI_IDS.baseSheet)).toHaveCount(0)
  await expect(page.getByTestId(UI_IDS.platformScreen)).toHaveCount(0)
  expect((await sheetNow(page)).openTabId).toBeNull()
  expect(await vehicleMode(page)).not.toBe('docked')
}

async function leaveTheBay(page: Page): Promise<void> {
  await page.evaluate(() => window.steampunkDebug!.input.tap('ui_cancel'))
  await expect.poll(() => shutterPhase(page), { timeout: OPEN_TIMEOUT_MS }).toBe('closed')
}

async function dockAt(page: Page, bay: 'sell' | 'upgrade'): Promise<void> {
  await page.evaluate((name) => {
    const result = window.steampunkDebug!.teleportToDock(name)
    if (!result.ok) throw new Error(result.problems.join('; '))
  }, bay)
  await expect.poll(() => shutterPhase(page), { timeout: OPEN_TIMEOUT_MS }).toBe('open')
}

function shutterPhase(page: Page): Promise<string> {
  return page.evaluate(() => {
    const result = window.steampunkDebug!.ui.getBayPresentation()
    return result.ok ? result.presentation.shutter.phase : 'closed'
  })
}

function sheetNow(page: Page): Promise<{ openTabId: string | null; isBayMenu: boolean }> {
  return page.evaluate(() => {
    const result = window.steampunkDebug!.ui.getSheet()
    if (!result.ok) throw new Error(result.problems.join('; '))
    return result.sheet
  })
}

function vehicleMode(page: Page): Promise<string> {
  return page.evaluate(() => {
    const result = window.steampunkDebug!.snapshot()
    if (!result.ok) throw new Error(result.problems.join('; '))
    const state = result.snapshot.state as {
      players: Record<string, { vehicle: { mode: string } }>
    }
    return Object.values(state.players)[0].vehicle.mode
  })
}
