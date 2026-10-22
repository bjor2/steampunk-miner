/**
 * Real buys for the unlock reveal's browser spec and its UI shot (ticket 718): docked at the
 * Upgrade bay with money, the Outfitter's own cards are pressed (a click acts; a finger's first tap
 * only shows the card's line, so a second acts), and the reveal is read through
 * `steampunkDebug.features['unlock-reveal']`, never pixels.
 */
import { expect, type Page } from '@playwright/test'
import type { DebugApi } from '../../src/debug/debugApi'
import { REVEAL_TEST_IDS } from '../../src/features/unlock-reveal/ui/UnlockRevealPlate'
import { UI_IDS } from '../../src/ui/ids'
import { SHEET_UI_IDS } from '../../src/ui/sheet/sheetIds'
import { dockAt } from './screens/screenHelpers'

declare global {
  interface Window {
    steampunkDebug?: DebugApi
  }
}

export const REVEAL_PLATE_TEST_ID = REVEAL_TEST_IDS.plate
/** The auto-gun turret's card: its first buy mounts the guns, a new capability. */
export const GUNS_CARD_TEST_ID = UI_IDS.upgradebayGunsBuy

/** What `steampunkDebug.features['unlock-reveal'].getReveal()` answers. */
export interface RevealReading {
  isPlaying: boolean
  isHeld: boolean
  item: string | null
  name: string | null
  startTick: number | null
  endTick: number | null
  glowSlots: string[]
  isHung: boolean
  tick: number
}

/** Software WebGL on a loaded box opens a screen slowly; a wait, not a judgement. */
const OPEN_TIMEOUT_MS = 30_000

/** Docked at the Upgrade bay with money to buy anything, the Outfitter open. */
export async function dockAtOutfitter(page: Page): Promise<void> {
  await page.evaluate(() => {
    const result = window.steampunkDebug!.giveMoney('1e30')
    if (!result.ok) throw new Error(result.problems.join('; '))
  })
  await dockAt(page, 'upgrade')
  await expect(page.getByTestId(SHEET_UI_IDS.outfitterCards)).toBeVisible({
    timeout: OPEN_TIMEOUT_MS,
  })
}

/** Keeps the next reveal up until a tap, so a slow box still sees it (UI state only). */
export async function holdNextReveal(page: Page): Promise<void> {
  await page.evaluate(() => {
    const result = window.steampunkDebug!.features['unlock-reveal'].holdReveal() as {
      ok: boolean
      problems?: string[]
    }
    if (!result.ok) throw new Error((result.problems ?? []).join('; '))
  })
}

/**
 * Presses a card until it acts: one click with a mouse; with a finger the first tap shows the
 * card's line and the second acts (#686 card reveal), as `vehicleItemShop.spec.ts` taps.
 */
export async function buyFromCard(page: Page, testId: string): Promise<void> {
  const card = page.getByTestId(testId)
  if (!(await isTouchScreen(page))) return card.click()
  await card.tap()
  await expect(card).toHaveAttribute('data-revealed', 'true')
  await card.tap()
}

function isTouchScreen(page: Page): Promise<boolean> {
  return page.evaluate(() => navigator.maxTouchPoints > 0)
}

export function readReveal(page: Page): Promise<RevealReading> {
  return page.evaluate(() => {
    return window.steampunkDebug!.features['unlock-reveal'].getReveal() as unknown as RevealReading
  })
}

/** Holds the reveal, then mounts the guns from the Outfitter, so the plate stays for the shot. */
export async function revealTurretMount(page: Page): Promise<void> {
  await dockAtOutfitter(page)
  await holdNextReveal(page)
  await buyFromCard(page, GUNS_CARD_TEST_ID)
  await expect(page.getByTestId(REVEAL_PLATE_TEST_ID)).toBeVisible({ timeout: OPEN_TIMEOUT_MS })
}
