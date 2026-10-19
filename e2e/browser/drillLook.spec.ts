/**
 * The drill look steps in the browser (#554, GD on #551 point 9): the bit and head glow steps up
 * when the `drill_power` purchases reach a threshold of `drillLook.json`; it adds no mesh, so the
 * frame stays inside #38's 150 draw calls. Asserted through `steampunkDebug`, never pixels.
 */
import { expect, test, type Page } from '@playwright/test'
import type { DebugApi } from '../../src/debug/debugApi'

declare global {
  interface Window {
    steampunkDebug?: DebugApi
  }
}

/** #38's frame budget. */
const FRAME_DRAW_CALLS_MAX = 150
/** The first threshold of `drillLook.json`. */
const FIRST_LOOK_PURCHASE = 5

interface DrillLookReading {
  purchases: number
  stage: number
  colour: string | null
}

async function openGame(page: Page): Promise<string[]> {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(String(error)))
  await page.goto('/?debug')
  await page.waitForFunction(() => window.steampunkDebug !== undefined)
  return errors
}

function setDrillPower(page: Page, purchases: number): Promise<void> {
  return page.evaluate((level) => {
    const result = window.steampunkDebug!.setUpgrade('drill_power', level)
    if (!result.ok) throw new Error(result.problems.join('; '))
  }, purchases)
}

function drillLook(page: Page): Promise<DrillLookReading> {
  return page.evaluate(() => {
    const result = window.steampunkDebug!.features['drill-look'].getLook()
    return result as unknown as DrillLookReading
  })
}

function frameDrawCalls(page: Page): Promise<number> {
  return page.evaluate(() => {
    const result = window.steampunkDebug!.ui.getRenderStats()
    if (!result.ok) throw new Error(result.problems.join('; '))
    return result.stats.drawCalls
  })
}

test.describe('drill look steps (#554)', () => {
  test('steps the drill look up at the first purchase threshold, inside the frame budget', async ({
    page,
  }) => {
    const errors = await openGame(page)
    await setDrillPower(page, FIRST_LOOK_PURCHASE - 1)
    await expect.poll(() => drillLook(page)).toMatchObject({ stage: 0, colour: null })

    await setDrillPower(page, FIRST_LOOK_PURCHASE)
    await expect.poll(async () => (await drillLook(page)).stage).toBe(1)
    expect((await drillLook(page)).colour).not.toBeNull()
    expect(await frameDrawCalls(page)).toBeLessThanOrEqual(FRAME_DRAW_CALLS_MAX)
    expect(errors).toEqual([])
  })

  test('shows a different look at purchases 20, 50 and 100', async ({ page }) => {
    const errors = await openGame(page)
    const colours: (string | null)[] = []
    for (const purchases of [20, 50, 100]) {
      await setDrillPower(page, purchases)
      await expect.poll(async () => (await drillLook(page)).purchases).toBe(purchases)
      colours.push((await drillLook(page)).colour)
    }
    expect(new Set(colours).size).toBe(3)
    expect(errors).toEqual([])
  })
})
