/**
 * The rig look ladder in the browser (#577): each upgrade track's look steps up at its first
 * threshold of `rigLook.json` and keeps changing on every purchase above its top step, painted as
 * glows on the car's own parts, so the frame stays inside #38's 150 draw calls. Asserted through
 * `steampunkDebug`, never pixels.
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

/** Each track's first and top step in `rigLook.json` (Systems' table on #157; #554 for drill_power). */
const LADDERS = [
  { track: 'drill_power', first: 5, top: 100 },
  { track: 'drill_tip', first: 70, top: 280 },
  { track: 'engine', first: 2, top: 26 },
  { track: 'boiler', first: 16, top: 16 },
  { track: 'cargo_hold', first: 23, top: 33 },
  { track: 'hull', first: 20, top: 440 },
]

interface RigLookReading {
  track: string
  purchases: number
  step: number
  tail: number
  tint: string | null
}

async function openGame(page: Page): Promise<string[]> {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(String(error)))
  await page.goto('/?debug')
  await page.waitForFunction(() => window.steampunkDebug !== undefined)
  return errors
}

function setUpgrade(page: Page, track: string, purchases: number): Promise<void> {
  return page.evaluate(
    ([upgradeId, level]) => {
      const result = window.steampunkDebug!.setUpgrade(upgradeId, level as number)
      if (!result.ok) throw new Error(result.problems.join('; '))
    },
    [track, purchases] as const,
  )
}

async function rigLookOf(page: Page, track: string): Promise<RigLookReading> {
  const looks = await page.evaluate(() => {
    const result = window.steampunkDebug!.features['rig-look'].getLooks()
    return (result as unknown as { looks: RigLookReading[] }).looks
  })
  return looks.find((look) => look.track === track)!
}

function frameDrawCalls(page: Page): Promise<number> {
  return page.evaluate(() => {
    const result = window.steampunkDebug!.ui.getRenderStats()
    if (!result.ok) throw new Error(result.problems.join('; '))
    return result.stats.drawCalls
  })
}

test.describe('rig look ladder (#577)', () => {
  test('steps every track up at its first threshold, inside the frame budget', async ({ page }) => {
    const errors = await openGame(page)
    for (const { track, first } of LADDERS) {
      await setUpgrade(page, track, first - 1)
      await expect.poll(async () => (await rigLookOf(page, track)).tint).toBeNull()
      await setUpgrade(page, track, first)
      await expect.poll(async () => (await rigLookOf(page, track)).step).toBe(1)
    }
    expect(await frameDrawCalls(page)).toBeLessThanOrEqual(FRAME_DRAW_CALLS_MAX)
    expect(errors).toEqual([])
  })

  test('shows a different look on each of the first purchases past the top step', async ({
    page,
  }) => {
    const errors = await openGame(page)
    for (const { track, top } of LADDERS) {
      const tints: (string | null)[] = []
      for (const purchases of [top, top + 1, top + 2]) {
        await setUpgrade(page, track, purchases)
        await expect.poll(async () => (await rigLookOf(page, track)).purchases).toBe(purchases)
        tints.push((await rigLookOf(page, track)).tint)
      }
      expect(tints[1]).not.toBe(tints[0])
      expect(tints[2]).not.toBe(tints[1])
    }
    expect(await frameDrawCalls(page)).toBeLessThanOrEqual(FRAME_DRAW_CALLS_MAX)
    expect(errors).toEqual([])
  })
})
