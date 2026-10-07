/**
 * The item cards the descriptions slice fills (#164, the Gameplay & Vehicle input rules on it),
 * read through `steampunkDebug` and the cards' data-* hooks, never pixels. Docked at the Upgrade
 * bay: by touch, a first tap on a shop entry opens its card and buys nothing, a second tap buys
 * once; menu focus (the gamepad's d-pad and A arrive as `ui_down` and `ui_confirm`) shows each
 * entry's card in turn and buys only on confirm; a mouse hover opens the Repair tooltip after its
 * delay; a 400 ms touch hold opens it with a haptic tick and its release repairs nothing.
 *
 * A purchase is counted on the stored steps: every `upgrade_purchased` raises one track a step (#181).
 */
import { expect, test, type Page } from '@playwright/test'
import type { DebugApi } from '../../src/debug/debugApi'

declare global {
  interface Window {
    steampunkDebug?: DebugApi
    /** Every `navigator.vibrate` call, recorded by the init script below. */
    vibrations?: number[]
  }
}

const DRILL_ENTRY = 'workshop-upgrade-drill_power-buy'
const TIP_ENTRY = 'workshop-upgrade-drill_tip-buy'
const REPAIR_TOOLTIP = '[data-item-tooltip="service:repair"]'
const LONG_PRESS_MS = 400
/** One page read takes about 1.5 s under software WebGL on a busy box. */
const SLOW_POLL = { timeout: 15_000 }

test.use({ hasTouch: true })
// Loading the build and docking takes most of the default 30 s under software WebGL on a busy box.
test.describe.configure({ timeout: 120_000 })

async function openAtUpgradeBay(page: Page): Promise<string[]> {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(String(error)))
  await page.addInitScript(() => {
    window.vibrations = []
    Object.defineProperty(Navigator.prototype, 'vibrate', {
      configurable: true,
      value: (pattern: number) => window.vibrations!.push(pattern) > 0,
    })
  })
  await page.goto('/?debug')
  await page.waitForFunction(() => window.steampunkDebug !== undefined)
  await page.evaluate(() => {
    const debug = window.steampunkDebug!
    for (const result of [debug.giveMoney('1e9'), debug.teleportToDock('upgrade')]) {
      if (!result.ok) throw new Error(result.problems.join('; '))
    }
  })
  await expect(page.getByTestId(DRILL_ENTRY)).toBeVisible({ timeout: 30_000 })
  return errors
}

function levelsTotal(page: Page): Promise<number> {
  return page.evaluate(() => {
    const result = window.steampunkDebug!.vehicleStats()
    if (!result.ok) throw new Error(result.problems.join('; '))
    return Object.values(result.levels).reduce((total, level) => total + level, 0)
  })
}

function tapAction(page: Page, action: string): Promise<void> {
  return page.evaluate((id) => {
    const result = window.steampunkDebug!.input.tap(id)
    if (!result.ok) throw new Error(result.problems.join('; '))
  }, action)
}

/** The compact entries whose card is open now. */
function openEntries(page: Page): Promise<string[]> {
  return page.evaluate(() =>
    [...document.querySelectorAll('[data-variant="compact"][aria-expanded="true"]')].map(
      (entry) => entry.getAttribute('data-testid') ?? '',
    ),
  )
}

test.describe('item cards (#164)', () => {
  test('opens a shop entry’s card on the first tap and buys it once on the second', async ({
    page,
  }) => {
    const errors = await openAtUpgradeBay(page)
    const before = await levelsTotal(page)
    await page.getByTestId(TIP_ENTRY).tap()
    await expect(page.getByTestId(TIP_ENTRY)).toHaveAttribute('aria-expanded', 'true')
    await expect(page.getByTestId(TIP_ENTRY)).toContainText('Drill tip')
    await expect(page.getByTestId(TIP_ENTRY)).toContainText('Level 0 → 0 · 1/9')
    expect(await levelsTotal(page)).toBe(before)
    await page.getByTestId(TIP_ENTRY).tap()
    await expect.poll(() => levelsTotal(page), SLOW_POLL).toBe(before + 1)
    expect(errors).toEqual([])
  })

  test('shows each focused entry’s card in turn and buys only on confirm', async ({ page }) => {
    const errors = await openAtUpgradeBay(page)
    const before = await levelsTotal(page)
    const seen: string[] = []
    let open = await openEntries(page)
    for (let step = 0; step < 3; step++) {
      const previous = open
      await tapAction(page, 'ui_down')
      await expect
        .poll(async () => (open = await openEntries(page)), SLOW_POLL)
        .not.toEqual(previous)
      expect(open).toHaveLength(1)
      seen.push(...open)
    }
    expect(new Set(seen).size).toBe(3)
    expect(await levelsTotal(page)).toBe(before)
    await tapAction(page, 'ui_confirm')
    await expect.poll(() => levelsTotal(page), SLOW_POLL).toBe(before + 1)
    expect(errors).toEqual([])
  })

  test('opens the Repair tooltip after a mouse hover', async ({ page }) => {
    const errors = await openAtUpgradeBay(page)
    await expect(page.locator(REPAIR_TOOLTIP)).toBeHidden()
    await page.getByTestId('workshop-repair').hover()
    await expect(page.locator(REPAIR_TOOLTIP)).toBeVisible()
    await expect(page.locator(REPAIR_TOOLTIP)).toContainText('Hull restored to')
    expect(errors).toEqual([])
  })

  test('opens the Repair card on a touch hold with a haptic tick, and the release repairs nothing', async ({
    page,
  }) => {
    const errors = await openAtUpgradeBay(page)
    await page.evaluate(() => {
      const result = window.steampunkDebug!.setHull('1')
      if (!result.ok) throw new Error(result.problems.join('; '))
    })
    const hullBefore = await page.getByTestId('workshop-hull').textContent()
    const anchor = page.locator(`:has(> ${REPAIR_TOOLTIP})`)
    const touch = { pointerType: 'touch', isPrimary: true, bubbles: true }
    await anchor.dispatchEvent('pointerdown', touch)
    await page.waitForTimeout(LONG_PRESS_MS + 100)
    await expect(page.locator(REPAIR_TOOLTIP)).toBeVisible()
    expect(await page.evaluate(() => window.vibrations)).toEqual([10])
    await anchor.dispatchEvent('pointerup', touch)
    await page.getByTestId('workshop-repair').dispatchEvent('click')
    await expect(page.locator(REPAIR_TOOLTIP)).toBeHidden()
    expect(await page.getByTestId('workshop-hull').textContent()).toBe(hullBefore)
    expect(errors).toEqual([])
  })
})
