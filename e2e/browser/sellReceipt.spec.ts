/**
 * The sale receipt (ticket 717): read through `steampunkDebug.features['sell-burst'].getReceipt()`
 * and the receipt's test ids, never pixels. A real sale shows the receipt with a total equal to
 * the wallet's gain to the coin, through the shared formatter; a tap skips the roll and the next
 * puts it away; the next trip compares with the last; a wide P41+ haul scrolls past eight lines
 * inside a receipt that stays on screen.
 */
import { expect, test } from '@playwright/test'
import { fromCanonical, sub, toCanonical } from '../../src/systems/money'
import { openGame, sellAtTheExchange } from './sellBurstSales'
import {
  readReceipt,
  RECEIPT_LAST_TRIP_TEST_ID,
  RECEIPT_ROWS_TEST_ID,
  RECEIPT_TEST_ID,
  RECEIPT_TOTAL_TEST_ID,
  sellWideHaul,
  walletNow,
} from './sellReceiptSales'

/** Software WebGL on a loaded box is slow; this is a wait, not a judgement. */
const TEST_TIMEOUT_MS = 240_000
const MOST_SHOWN_LINES = 8

/** `after − before` of two canonical amounts, in the game's own Money. */
function gainOf(before: string, after: string): string {
  return toCanonical(sub(fromCanonical(after), fromCanonical(before)))
}

test.describe('sale receipt (ticket 717)', () => {
  test("a sale's receipt totals the wallet's gain to the coin and a tap skips its roll", async ({
    page,
  }) => {
    test.setTimeout(TEST_TIMEOUT_MS)
    const errors = await openGame(page)
    const before = await walletNow(page)
    const sold = await sellAtTheExchange(page, { legs: [{ planet: 1, tiles: 4 }], sells: ['all'] })
    await expect(page.getByTestId(RECEIPT_TEST_ID)).toBeVisible({ timeout: 30_000 })
    const receipt = await readReceipt(page)
    expect(receipt.isShown).toBe(true)
    expect(receipt.net).toBe(gainOf(before, sold.wallet))
    expect(receipt.lines.reduce((total, line) => total + line.count, 0)).toBe(4)
    await page.getByTestId(RECEIPT_TEST_ID).click()
    await expect(page.getByTestId(RECEIPT_TOTAL_TEST_ID)).toHaveAttribute(
      'data-exact',
      receipt.net ?? '',
    )
    expect((await readReceipt(page)).isRolling).toBe(false)
    await page.getByTestId(RECEIPT_TEST_ID).click()
    await expect(page.getByTestId(RECEIPT_TEST_ID)).toHaveCount(0)
    expect(errors).toEqual([])
  })

  test('the next trip compares its total with the last trip', async ({ page }) => {
    test.setTimeout(TEST_TIMEOUT_MS)
    const errors = await openGame(page)
    await sellAtTheExchange(page, { legs: [{ planet: 1, tiles: 2 }], sells: ['all'] })
    const first = await readReceipt(page)
    await sellAtTheExchange(page, { legs: [{ planet: 2, tiles: 2 }], sells: ['all'] })
    await expect(page.getByTestId(RECEIPT_TEST_ID)).toBeVisible({ timeout: 30_000 })
    expect((await readReceipt(page)).lastTripNet).toBe(first.net)
    await expect(page.getByTestId(RECEIPT_LAST_TRIP_TEST_ID)).toHaveAttribute(
      'data-compare',
      /^(up|down|level)$/,
    )
    expect(errors).toEqual([])
  })

  test('a wide P41+ haul lists every tier and scrolls past eight lines on screen', async ({
    page,
  }) => {
    test.setTimeout(TEST_TIMEOUT_MS)
    const errors = await openGame(page)
    await sellWideHaul(page)
    const receipt = await readReceipt(page)
    expect(receipt.lines.length).toBeGreaterThanOrEqual(MOST_SHOWN_LINES)
    const rows = page.getByTestId(RECEIPT_ROWS_TEST_ID)
    const { scroll, client } = await rows.evaluate((element) => {
      const viewport = element.firstElementChild ?? element
      return { scroll: viewport.scrollHeight, client: viewport.clientHeight }
    })
    if (receipt.lines.length > MOST_SHOWN_LINES) expect(scroll).toBeGreaterThan(client)
    const box = await page.getByTestId(RECEIPT_TEST_ID).boundingBox()
    const viewport = page.viewportSize()
    expect(box !== null && viewport !== null).toBe(true)
    expect(box!.y + box!.height).toBeLessThanOrEqual(viewport!.height)
    expect(errors).toEqual([])
  })
})
