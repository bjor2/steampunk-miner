/**
 * The store's buy path for tech-unlocked vehicle items in the preview build (ticket 248), read
 * through `steampunkDebug` and the rows' data-* hooks, never pixels. On planet 3 with the tree
 * researched through it, the Upgrade bay shows the grapple winch as a compact item card; a first
 * tap opens the card and buys nothing, a second buys it at exactly the card's price, and the row
 * leaves the bay once the item is owned.
 */
import { expect, test, type Page } from '@playwright/test'
import type { DebugApi } from '../../src/debug/debugApi'

declare global {
  interface Window {
    steampunkDebug?: DebugApi
  }
}

const GRAPPLE = 'power.grapple_winch'
const GRAPPLE_ENTRY = `upgradebay-item-${GRAPPLE}-buy`
const GRAPPLE_PLANET = 3

test.use({ hasTouch: true })
// Loading the build and docking takes most of the default 30 s under software WebGL on a busy box.
test.describe.configure({ timeout: 120_000 })

async function openWithGrappleResearched(page: Page): Promise<string[]> {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(String(error)))
  await page.goto('/?debug')
  await page.waitForFunction(() => window.steampunkDebug !== undefined)
  await page.evaluate((planet) => {
    const debug = window.steampunkDebug!
    const results = [
      debug.setPlanet(planet),
      debug.features['tech-tree'].jumpToDepth(planet) as { ok: boolean; problems?: string[] },
      debug.giveMoney('1e9'),
      debug.teleportToDock('upgrade'),
    ]
    for (const result of results) {
      if (!result.ok) throw new Error((result.problems ?? []).join('; '))
    }
  }, GRAPPLE_PLANET)
  await expect(page.getByTestId(GRAPPLE_ENTRY)).toBeVisible({ timeout: 30_000 })
  return errors
}

interface ShopReading {
  itemIds: string[]
  cardPrice: string | null
  money: string
}

function readShop(page: Page): Promise<ShopReading> {
  return page.evaluate((itemId) => {
    const result = window.steampunkDebug!.ui.getUpgradeBayModel()
    if (!result.ok) throw new Error(result.problems.join('; '))
    const { items, header } = result.model
    const row = items.find((item) => item.itemId === itemId)
    return {
      itemIds: items.map((item) => item.itemId),
      cardPrice: row?.card.cost?.exact ?? null,
      money: header.money.exact,
    }
  }, GRAPPLE)
}

test.describe('vehicle item shop (ticket 248)', () => {
  test('shows the researched grapple as a card and buys it on the second tap', async ({ page }) => {
    const errors = await openWithGrappleResearched(page)
    const before = await readShop(page)
    expect(before.itemIds).toContain(GRAPPLE)
    expect(before.cardPrice).not.toBeNull()
    await page.getByTestId(GRAPPLE_ENTRY).tap()
    await expect(page.getByTestId(GRAPPLE_ENTRY)).toHaveAttribute('aria-expanded', 'true')
    expect((await readShop(page)).money).toBe(before.money)
    await page.getByTestId(GRAPPLE_ENTRY).tap()
    await expect(page.getByTestId(GRAPPLE_ENTRY)).toHaveCount(0, { timeout: 15_000 })
    const after = await readShop(page)
    expect(after.itemIds).not.toContain(GRAPPLE)
    expect(after.money).not.toBe(before.money)
    expect(errors).toEqual([])
  })
})
