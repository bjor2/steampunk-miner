/**
 * The Upgrade bay's entries as the Outfitter's sheet cards (ticket 687, the card rules of #686
 * and the Gameplay & Vehicle input rules on #164), read through `steampunkDebug` and the cards'
 * data-* hooks, never pixels. By touch, a first tap on an entry shows its gain text and buys
 * nothing, a second tap buys once; menu focus (the gamepad's d-pad and A arrive as `ui_down` and
 * `ui_confirm`) lights each entry in turn and buys only on confirm.
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

/** The cards the game's menu focus lights now. */
function openEntries(page: Page): Promise<string[]> {
  return page.evaluate(() =>
    [...document.querySelectorAll('[data-sheet-card][data-focused="true"]')].map(
      (entry) => entry.getAttribute('data-testid') ?? '',
    ),
  )
}

test.describe('item cards (#164)', () => {
  test('shows an entry’s gain text on the first tap and buys it once on the second', async ({
    page,
  }) => {
    const errors = await openAtUpgradeBay(page)
    const before = await levelsTotal(page)
    await page.getByTestId(TIP_ENTRY).tap()
    await expect(page.getByTestId(TIP_ENTRY)).toHaveAttribute('data-revealed', 'true')
    await expect(page.getByTestId(TIP_ENTRY)).toContainText('Drill tip')
    await expect(page.getByTestId(TIP_ENTRY)).toContainText('% tip hardness')
    expect(await levelsTotal(page)).toBe(before)
    await page.getByTestId(TIP_ENTRY).tap()
    await expect.poll(() => levelsTotal(page), SLOW_POLL).toBe(before + 1)
    expect(errors).toEqual([])
  })

  test('lights each focused entry in turn and buys only on confirm', async ({ page }) => {
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
})
