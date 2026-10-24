/**
 * The Cache Crate's placed containers in the preview build (ticket 823; the TD's final ruling on
 * #823, point 8), read through `steampunkDebug`, never pixels: a scenario's container shows as a
 * map marker at its cell and as a card on the "Cache Crates" tab of the base sheet, at 360 px and
 * 1280 px, and its card's verb moves the cargo into the hold.
 */
import { expect, test, type Page } from '@playwright/test'
import type { DebugApi } from '../../src/debug/debugApi'

declare global {
  interface Window {
    steampunkDebug?: DebugApi
  }
}

const VIEWPORTS = [
  { label: '360 px', size: { width: 360, height: 760 } },
  { label: '1280 px', size: { width: 1280, height: 800 } },
] as const

const MARKER = '[data-testid="planet-kit-container-marker"]'
const CARD = '[data-testid="planet-kit-container-card"]'

interface Row {
  key: string
  units: number
  isHere: boolean
  canTake: boolean
}

async function openWithCrate(page: Page): Promise<string[]> {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(String(error)))
  await page.goto('/?debug')
  await page.waitForFunction(() => window.steampunkDebug !== undefined)
  const placed = await page.evaluate(() =>
    window.steampunkDebug!.features['planet-kit'].placeContainer({ ore: { '1': 3, '2': 2 } }),
  )
  expect(placed).toEqual({ ok: true })
  return errors
}

function containers(page: Page): Promise<Row[]> {
  return page.evaluate(() => {
    const result = window.steampunkDebug!.features['planet-kit'].containers() as {
      containers?: Row[]
    }
    return result.containers ?? []
  })
}

for (const { label, size } of VIEWPORTS) {
  test(`shows a placed crate as a marker and a card at ${label}`, async ({ page }) => {
    await page.setViewportSize(size)
    const errors = await openWithCrate(page)
    await expect
      .poll(() => containers(page))
      .toEqual([expect.objectContaining({ key: '1:1#1', units: 5, isHere: true, canTake: true })])
    await expect(page.locator(MARKER)).toHaveCount(1)
    await page.evaluate(() => window.steampunkDebug!.ui.openSheet('planet-kit.containers'))
    await expect(page.locator(CARD)).toHaveCount(1)
    await expect(page.locator(CARD)).toBeInViewport()
    expect(errors).toEqual([])
  })
}

test('the card’s verb moves the crate’s cargo into the hold and removes it', async ({ page }) => {
  const errors = await openWithCrate(page)
  await page.evaluate(() => window.steampunkDebug!.ui.openSheet('planet-kit.containers'))
  // A mouse press acts at once (the card's first tap only reveals its line on touch).
  await page.locator(CARD).click()
  await expect.poll(() => containers(page)).toEqual([])
  await expect(page.locator(MARKER)).toHaveCount(0)
  expect(errors).toEqual([])
})
