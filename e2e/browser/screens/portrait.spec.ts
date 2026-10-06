/**
 * Portrait (#173, TD acceptance 8): on every phone and tablet held upright the "turn your device"
 * card covers the stage while the simulation keeps ticking, and turning to landscape dismisses it
 * with no reload.
 */
import { expect, test } from '@playwright/test'
import { currentCell, openGame } from './screenHelpers'

test.beforeEach(() => {
  test.skip(!currentCell().isPortrait, 'the card shows in portrait only')
})

test.describe('screen matrix: portrait (#173)', () => {
  test('shows the turn-your-device card, keeps ticking, and goes on rotation without a reload', async ({
    page,
  }) => {
    const cell = currentCell()
    const errors = await openGame(page, cell)
    await expect(page.getByTestId('portrait-card')).toBeVisible()
    await page.evaluate(() => Object.assign(window, { portraitMarker: true }))
    const tickNow = () =>
      page.evaluate(() => {
        const result = window.steampunkDebug!.snapshot()
        return result.ok ? result.snapshot.tick : -1
      })
    const before = await tickNow()
    await expect.poll(tickNow, { timeout: 30_000 }).toBeGreaterThan(before)
    await page.setViewportSize({ width: cell.viewport.height, height: cell.viewport.width })
    await expect(page.getByTestId('portrait-card')).toBeHidden()
    expect(await page.evaluate(() => 'portraitMarker' in window)).toBe(true)
    expect(errors).toEqual([])
  })
})
