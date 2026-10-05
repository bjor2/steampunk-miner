/**
 * The bay screens (#45, #44, #62): read through `steampunkDebug.ui`, never pixels. Docked at the
 * Upgrade bay, the live preview frames the vehicle at 60% ±5% of its panel's height at 1080p and
 * 4K (#39 acceptance 5, moved here from S5 by the scope review on #54), the shop text is at least
 * 2.2% of the short axis, the shutter opens and closes, and the seven icons sit on their rows.
 */
import { expect, test, type Page } from '@playwright/test'
import type { DebugApi } from '../../src/debug/debugApi'
import type { BayPresentation } from '../../src/debug/debugScreens'

declare global {
  interface Window {
    steampunkDebug?: DebugApi
  }
}

// #39 acceptance 5: 60% of the panel height, ±5%.
const SHARE_PERCENT = { target: 60, tolerance: 5 }
const TEXT_SHARE = 0.022

async function openAtUpgradeBay(page: Page): Promise<string[]> {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(String(error)))
  await page.goto('/?debug')
  await page.waitForFunction(() => window.steampunkDebug !== undefined)
  await page.evaluate(() => {
    const result = window.steampunkDebug!.teleportToDock('upgrade')
    if (!result.ok) throw new Error(result.problems.join('; '))
  })
  return errors
}

function presentation(page: Page): Promise<BayPresentation> {
  return page.evaluate(() => {
    const result = window.steampunkDebug!.ui.getBayPresentation()
    if (!result.ok) throw new Error(result.problems.join('; '))
    return result.presentation
  })
}

/** Once the shutter is open and the preview camera has framed a frame at this panel size. */
async function settledPresentation(page: Page, shortAxisPixels: number): Promise<BayPresentation> {
  await expect
    .poll(
      async () => {
        const now = await presentation(page)
        return now.shutter.phase === 'open' && now.type.shortAxisPixels === shortAxisPixels
          ? now.preview.vehicleShare > 0
          : false
      },
      { timeout: 30_000 },
    )
    .toBe(true)
  return presentation(page)
}

test.describe('bay screens (#62)', () => {
  test('frames the upgradebay-preview vehicle at 60% ±5% of the panel height at 1080p and 4K', async ({
    page,
  }) => {
    test.setTimeout(120_000)
    await page.setViewportSize({ width: 1920, height: 1080 })
    const errors = await openAtUpgradeBay(page)
    const at1080p = await settledPresentation(page, 1080)
    await page.setViewportSize({ width: 3840, height: 2160 })
    const at4k = await settledPresentation(page, 2160)
    for (const { preview, type } of [at1080p, at4k]) {
      expect(Math.abs(preview.vehicleShare * 100 - SHARE_PERCENT.target)).toBeLessThanOrEqual(
        SHARE_PERCENT.tolerance,
      )
      expect(preview.panelHeightPixels).toBeGreaterThan(0)
      expect(type.smallestTextPixels).toBeGreaterThanOrEqual(type.shortAxisPixels * TEXT_SHARE)
    }
    expect(errors).toEqual([])
  })

  test('opens the Upgrade bay behind the brass shutter and closes it again on undock', async ({
    page,
  }) => {
    const errors = await openAtUpgradeBay(page)
    await expect.poll(async () => (await presentation(page)).shutter.phase).toBe('open')
    expect((await presentation(page)).shutter).toMatchObject({
      bay: 'upgrade',
      transition: { kind: 'shutter', seconds: 0.25 },
    })
    await page.evaluate(() => window.steampunkDebug!.input.tap('ui_cancel'))
    await expect.poll(async () => (await presentation(page)).shutter.phase).toBe('closed')
    expect(errors).toEqual([])
  })

  test('puts an icon on every track row and on the Casing row', async ({ page }) => {
    const errors = await openAtUpgradeBay(page)
    const iconIds = await page.evaluate(() => {
      const result = window.steampunkDebug!.ui.getUpgradeBayModel()
      if (!result.ok) throw new Error(result.problems.join('; '))
      return [...result.model.tracks.map((row) => row.iconId), result.model.casing.iconId]
    })
    expect(iconIds).toHaveLength(7)
    for (const iconId of iconIds) await expect(page.getByTestId(iconId)).toBeVisible()
    expect(errors).toEqual([])
  })
})
