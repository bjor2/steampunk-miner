/**
 * The bore gun on a desktop in the preview build (ticket 314, the TD lock on #314 section 2): the
 * gauge panel shows once the gun is mounted, a held fire key fires at each `nextShotTick` and stops
 * when it comes up, and a canvas click fires through the same press. The tracer asks the kernel's
 * spray pool. State through `steampunkDebug`, the run log and the DOM's test ids, never pixels.
 */
import { expect, test, type Page } from '@playwright/test'
import type { DebugApi } from '../../src/debug/debugApi'

declare global {
  interface Window {
    steampunkDebug?: DebugApi
    steampunkRunLog?: () => string
  }
}

const FIRE_GAUGE = 'ground-gun-fire-gauge'
/** Long enough for a shot at the 45-tick cadence floor or a recovery in surface rock, at 60 ticks/s. */
const HOLD_MS = 2500

test.describe('the bore gun on a desktop (ticket 314)', () => {
  test('shows the gauge with the fire key once the gun is mounted', async ({ page }) => {
    const errors = await openDrawnGame(page)
    await expect(page.getByTestId(FIRE_GAUGE)).toHaveCount(0)
    await mountGun(page)
    await expect(page.getByTestId(FIRE_GAUGE)).toBeVisible()
    await expect(page.getByTestId(FIRE_GAUGE)).toContainText('Fire (Left Mouse)')
    expect(errors).toEqual([])
  })

  test('fires while the key is held and stops once it comes up', async ({ page }) => {
    const errors = await openDrawnGame(page)
    await mountGun(page)
    await page.keyboard.down('KeyX')
    await expect.poll(() => boreShotsLogged(page)).toBeGreaterThanOrEqual(1)
    await page.waitForTimeout(HOLD_MS)
    await page.keyboard.up('KeyX')
    const shotsAtRelease = await boreShotsLogged(page)
    await page.waitForTimeout(HOLD_MS)
    expect(await boreShotsLogged(page)).toBe(shotsAtRelease)
    expect(await sprayRequests(page)).toBeGreaterThan(0)
    expect(errors).toEqual([])
  })

  test('fires one shot on a canvas click', async ({ page }) => {
    const errors = await openDrawnGame(page)
    await mountGun(page)
    const canvas = await page.locator('canvas').first().boundingBox()
    if (canvas === null) throw new Error('the game canvas is not drawn')
    await page.mouse.click(canvas.x + canvas.width / 2, canvas.y + canvas.height * 0.75)
    await expect.poll(() => boreShotsLogged(page)).toBe(1)
    expect(errors).toEqual([])
  })
})

async function openDrawnGame(page: Page): Promise<string[]> {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(String(error)))
  await page.goto('/?debug')
  await page.waitForFunction(() => {
    const stats = window.steampunkDebug?.ui.getRenderStats()
    return stats?.ok === true && stats.stats.drawCalls > 0
  })
  return errors
}

function mountGun(page: Page): Promise<void> {
  return page.evaluate(() => {
    const result = window.steampunkDebug!.features['ground-gun'].setLevels(1, 1, 1)
    if (!result.ok) throw new Error(result.problems.join('; '))
  })
}

function boreShotsLogged(page: Page): Promise<number> {
  return page.evaluate(
    () => (window.steampunkRunLog?.() ?? '').split('"event":"bore_fired"').length - 1,
  )
}

function sprayRequests(page: Page): Promise<number> {
  return page.evaluate(() => {
    const result = window.steampunkDebug!.ui.getSprayStats()
    if (!result.ok) throw new Error(result.problems.join('; '))
    return result.stats.requested
  })
}
