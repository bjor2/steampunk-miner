/**
 * Real sales for the sale receipt's browser specs (ticket 717), on the sell burst's haul helpers:
 * the receipt as `steampunkDebug.features['sell-burst'].getReceipt()` reads it, the wallet a sale
 * starts from, and a haul wide enough for the receipt to scroll: eight planets from P41 (HS: P41+
 * numbers), so at least eight tiers sell, with the hold raised so no unit is lost to a full hold.
 */
import { expect, type Page } from '@playwright/test'
import { readBurst, sellAtTheExchange, type BurstReading } from './sellBurstSales'

export const RECEIPT_TEST_ID = 'sell-burst-receipt'
export const RECEIPT_ROWS_TEST_ID = 'sell-burst-receipt-rows'
export const RECEIPT_TOTAL_TEST_ID = 'sell-burst-receipt-total'
export const RECEIPT_LAST_TRIP_TEST_ID = 'sell-burst-receipt-last-trip'

/** What `getReceipt()` answers, every amount canonical. */
export interface ReceiptReading {
  isShown: boolean
  isRolling: boolean
  lines: {
    tier: number
    key: string
    name: string | null
    rarity: string | null
    count: number
    coin: string
  }[]
  credits: string | null
  liningPaid: string | null
  net: string | null
  shown: string | null
  lastTripNet: string | null
}

/** Eight planets from P41, two surface tiles each: at least one tier per planet. */
export const WIDE_HAUL = Array.from({ length: 8 }, (_, index) => ({ planet: 41 + index, tiles: 2 }))
/** Room for every unit of the wide haul. */
const WIDE_HOLD_LEVEL = 40

export function readReceipt(page: Page): Promise<ReceiptReading> {
  return page.evaluate(
    () => window.steampunkDebug!.features['sell-burst'].getReceipt() as unknown as ReceiptReading,
  )
}

/** Sells the wide haul at once and waits for the receipt to show. */
export async function sellWideHaul(page: Page): Promise<BurstReading> {
  await raiseHold(page, WIDE_HOLD_LEVEL)
  const sold = await sellAtTheExchange(page, { legs: WIDE_HAUL, sells: ['all'] })
  await expect(page.getByTestId(RECEIPT_TEST_ID)).toBeVisible({ timeout: 30_000 })
  return sold
}

/** The wallet the next sale starts from: mining and docking pay nothing (the bill waits). */
export async function walletNow(page: Page): Promise<string> {
  return (await readBurst(page)).wallet
}

async function raiseHold(page: Page, level: number): Promise<void> {
  await page.evaluate((holdLevel) => {
    const debug = window.steampunkDebug!
    const at = (debug.features['sell-burst'].getBurst() as unknown as { tick: number }).tick + 1
    const command = {
      tick: at,
      type: 'debug.setUpgrade',
      payload: { upgradeId: 'cargo_hold', level: holdLevel },
    }
    const played = debug.fastForward(1, [command] as Parameters<typeof debug.fastForward>[1])
    if (!played.ok) throw new Error(played.problems.join('; '))
  }, level)
}
