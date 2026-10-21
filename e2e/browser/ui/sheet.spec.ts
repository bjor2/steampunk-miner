/**
 * The shared sheet (spec #678, ticket 686) on the example slice's probe tabs, at the UI suite's
 * cells. On a phone it covers the stage, keeps its tabs and Close out of the top 15% (the thumb
 * zone holds the controls), and a card's first tap shows its line while only the second acts. On
 * desktop it docks beside the view: the stage narrows by the dock and the sheet sits in the freed
 * column, a click acts at once, and closing gives the view its width back. Escape closes it.
 * Geometry and state through the DOM and `steampunkDebug` only, never pixels.
 */
import { expect, test, type Page } from '@playwright/test'
import { DESIGN_TOKENS } from '../../../src/systems/views/designSystem'
import { DEVICE_UI_IDS } from '../../../src/ui/stage/deviceIds'
import { SHEET_UI_IDS } from '../../../src/ui/sheet/sheetIds'
import { openGame, SLACK_PX } from '../hud/hudLayoutHelpers'
import { UI_SHOT_CELLS } from './uiShotCells'
import { openBaseSheet } from './uiShotSheets'

/** Software WebGL on a loaded box is slow; this is a wait, not a judgement. */
const TEST_TIMEOUT_MS = 180_000
const FIRST_CARD = 'example.cards.drill'
const CARD = `[data-sheet-card="${FIRST_CARD}"]`

for (const cell of UI_SHOT_CELLS) {
  test.describe(`shared sheet (ticket 686): ${cell.name}`, () => {
    test.use({
      viewport: cell.viewport,
      isMobile: cell.isTouch,
      hasTouch: cell.isTouch,
      deviceScaleFactor: 1,
    })

    test('opens on the probe tab where the layout puts it, and Escape closes it', async ({
      page,
    }) => {
      test.setTimeout(TEST_TIMEOUT_MS)
      const errors = await openGame(page, cell)
      await openBaseSheet(page)
      const sheet = await readSheet(page)
      expect(sheet.openTabId).toBe('example.cards')
      expect(sheet.placement).toBe(cell.layout === 'phone' ? 'full' : 'docked')
      await page.evaluate(() => window.steampunkDebug!.input.tap('ui_cancel'))
      await expect(page.getByTestId(SHEET_UI_IDS.baseSheet)).toHaveCount(0)
      expect((await readSheet(page)).openTabId).toBeNull()
      expect(errors).toEqual([])
    })

    if (cell.layout === 'phone') {
      test('covers the stage with nothing to tap in the top 15%, and reveals before it acts', async ({
        page,
      }) => {
        test.setTimeout(TEST_TIMEOUT_MS)
        await openGame(page, cell)
        await openBaseSheet(page)
        const keepOut = (cell.viewport.height * DESIGN_TOKENS.layout.topKeepOutPercent) / 100
        const close = await boxOf(page, '[data-sheet-close]')
        expect(close.y).toBeGreaterThanOrEqual(keepOut)
        for (const tab of await page.locator('[data-sheet-tab]').all()) {
          expect((await tab.boundingBox())!.y).toBeGreaterThanOrEqual(keepOut)
        }
        await page.locator(CARD).tap()
        expect((await readSheet(page)).revealedCardId).toBe(FIRST_CARD)
        await expect(page.locator(CARD)).toHaveAttribute('data-revealed', 'true')
        expect(await actedCardOf(page)).toBeNull()
        await page.locator(CARD).tap()
        expect(await actedCardOf(page)).toBe(FIRST_CARD)
      })
    } else {
      test('docks beside the view, narrowing the stage, and gives the width back on close', async ({
        page,
      }) => {
        test.setTimeout(TEST_TIMEOUT_MS)
        await openGame(page, cell)
        const wide = await boxOf(page, `[data-testid="${DEVICE_UI_IDS.gameStage}"]`)
        await openBaseSheet(page)
        const narrow = await boxOf(page, `[data-testid="${DEVICE_UI_IDS.gameStage}"]`)
        const dockWidth = DESIGN_TOKENS.layout.sheetDock.widthPx
        expect(Math.abs(wide.width - narrow.width - dockWidth)).toBeLessThanOrEqual(SLACK_PX)
        const sheet = await boxOf(page, `[data-testid="${SHEET_UI_IDS.baseSheet}"]`)
        expect(sheet.x).toBeGreaterThanOrEqual(narrow.x + narrow.width - SLACK_PX)
        await page.locator(CARD).click()
        expect(await actedCardOf(page)).toBe(FIRST_CARD)
        await page.locator('[data-sheet-close]').click()
        await expect(page.getByTestId(SHEET_UI_IDS.baseSheet)).toHaveCount(0)
        await expect
          .poll(async () => (await boxOf(page, `[data-testid="${DEVICE_UI_IDS.gameStage}"]`)).width)
          .toBe(wide.width)
      })
    }
  })
}

async function readSheet(page: Page) {
  return page.evaluate(() => {
    const result = window.steampunkDebug!.ui.getSheet()
    if (!result.ok) throw new Error(result.problems.join('; '))
    return result.sheet
  })
}

async function actedCardOf(page: Page): Promise<string | null> {
  return page.evaluate(() => {
    const result = window.steampunkDebug!.features.example!.getActedCard!()
    return 'cardId' in result ? (result.cardId as string | null) : null
  })
}

async function boxOf(page: Page, selector: string) {
  const box = await page.locator(selector).first().boundingBox()
  if (box === null) throw new Error(`${selector} is not on screen`)
  return box
}
