/**
 * Tap-only affordances on a touch screen (ticket 476, spec #470 section 3): nothing a mouse
 * hovers for or a finger holds for is out of reach by a tap. Each Outfitter card shows its name
 * and price with no hover or hold (ticket 687); a tap on an element's own text pins
 * its card open; a planet-200 wallet stays inside the bay header and a tap on it shows the exact
 * amount; a tapped button keeps no hover style. State through `steampunkDebug` and the DOM's
 * test ids and computed styles, never pixels.
 */
import { expect, test, type Page } from '@playwright/test'
import { EXACT_AMOUNT_IDS } from '../../../src/ui/sheets/exactAmountIds'
import { skipWhereEngineIsMissing } from '../mobile/mobileHelpers'
import { currentCell, openGame } from './screenHelpers'

/** A planet-200 wallet whose short text, 1e149, hides most of its digits (TD on #470). */
const P200_WALLET = '1.234567890123e149'
const P200_WALLET_EXACT = '1.234567890123e+149'
/** The Upgrade bay header's element: its brass tooltip names the header's glyphs (pass #425). */
const HEADER_ID = 'upgrade-bay.header'

// The mobile projects run this spec too (ticket 481); WebKit may not be installed.
skipWhereEngineIsMissing()

test.beforeEach(() => {
  const cell = currentCell()
  test.skip(
    !cell.isTouch || cell.isPortrait,
    'tap affordances are judged on landscape touch screens',
  )
})

/** Docking at the Upgrade bay opens the Outfitter on the sheet (ticket 687); this shuts it. */
async function closeSheet(page: Page): Promise<void> {
  await page.evaluate(() => window.steampunkDebug!.ui.closeSheet())
}

async function dockWithMoney(page: Page, bay: 'upgrade' | 'sell', money: string): Promise<void> {
  await page.evaluate(
    ({ bay, money }) => {
      const debug = window.steampunkDebug!
      for (const result of [debug.giveMoney(money), debug.teleportToDock(bay)]) {
        if (!result.ok) throw new Error(result.problems.join('; '))
      }
    },
    { bay, money },
  )
}

test.describe('screen matrix: tap-only affordances (ticket 476)', () => {
  test('reports no hover on the touch screen, the case every hover rule is gated on', async ({
    page,
  }) => {
    const errors = await openGame(page, currentCell())
    expect(await page.evaluate(() => matchMedia('(hover: none)').matches)).toBe(true)
    expect(errors).toEqual([])
  })

  test('shows every Outfitter card’s name and price with no hover or hold (ticket 687)', async ({
    page,
  }) => {
    const errors = await openGame(page, currentCell())
    await dockWithMoney(page, 'upgrade', '1e9')
    const cards = page.locator('[data-sheet-card]')
    await expect(cards.first()).toBeVisible({ timeout: 30_000 })
    const count = await cards.count()
    expect(count).toBeGreaterThan(0)
    for (let index = 0; index < count; index++) {
      await expect(cards.nth(index)).toContainText(/\p{L}/u)
    }
    await expect(page.getByTestId('workshop-upgrade-drill_tip-buy')).toContainText(/\d/)
    expect(errors).toEqual([])
  })

  test('pins an item card open on a tap of its text, with no hold, and closes it on the next', async ({
    page,
  }) => {
    const errors = await openGame(page, currentCell())
    await dockWithMoney(page, 'upgrade', '1e9')
    await closeSheet(page)
    const card = page.locator(`[data-tooltip="${HEADER_ID}"]`)
    const title = page.locator(`[data-ui-text="${HEADER_ID}"] > :first-child`)
    await expect(title).toBeVisible({ timeout: 30_000 })
    await expect(card).toBeHidden()
    await title.tap()
    await expect(card).toBeVisible()
    await expect(card).toHaveAttribute('data-pinned', 'true')
    await title.tap()
    await expect(card).toBeHidden()
    expect(errors).toEqual([])
  })

  test('keeps a planet-200 wallet inside the bay header and shows its exact amount on a tap', async ({
    page,
  }) => {
    const errors = await openGame(page, currentCell())
    await dockWithMoney(page, 'sell', P200_WALLET)
    const money = page.getByTestId('platform-money')
    await expect(money).toHaveText('1e149', { timeout: 30_000 })
    const moneyBox = await money.boundingBox()
    const headerBox = await page.locator('header:has([data-testid="platform-money"])').boundingBox()
    expect(moneyBox).not.toBeNull()
    expect(headerBox).not.toBeNull()
    expect(moneyBox!.x + moneyBox!.width).toBeLessThanOrEqual(headerBox!.x + headerBox!.width)
    expect(moneyBox!.y + moneyBox!.height).toBeLessThanOrEqual(headerBox!.y + headerBox!.height)
    await money.locator('[data-tap-exact]').tap()
    const sheet = page.getByTestId(EXACT_AMOUNT_IDS.sheet)
    await expect(sheet).toBeVisible()
    await expect(page.getByTestId(EXACT_AMOUNT_IDS.text)).toContainText(P200_WALLET_EXACT)
    await sheet.tap()
    await expect(sheet).toBeHidden()
    expect(errors).toEqual([])
  })

  test('leaves no hover background on a button after a tap', async ({ page }) => {
    const errors = await openGame(page, currentCell())
    await dockWithMoney(page, 'upgrade', '1e9')
    await closeSheet(page)
    const button = page.getByTestId('platform-settings')
    await expect(button).toBeVisible({ timeout: 30_000 })
    const before = await button.evaluate((element) => getComputedStyle(element).backgroundColor)
    await button.tap()
    const after = await button.evaluate((element) => getComputedStyle(element).backgroundColor)
    expect(after).toBe(before)
    expect(errors).toEqual([])
  })
})
