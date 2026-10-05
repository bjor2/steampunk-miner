/**
 * The lit render's budgets (#38 acceptance 1, 4 and 6, #60): read through
 * `steampunkDebug.ui.getRenderStats()`, never pixels. At the 20 m zoom-out the frame draws at most
 * 48 ground blocks and 150 draw calls, the same blocks at 1080p and 4K, with the headlamp and at
 * most 4 point lights; the HTML UI is outside the canvas, so the render scale never changes it.
 * That the session digest ignores the scale and the zoom is pinned in `debugScreens.test.ts`.
 */
import { expect, test, type Page } from '@playwright/test'
import type { DebugApi } from '../../src/debug/debugApi'

declare global {
  interface Window {
    steampunkDebug?: DebugApi
  }
}

const MAX_GROUND_BLOCKS = 48
const MAX_DRAW_CALLS = 150
const MAX_POINT_LIGHTS = 4

async function openGame(page: Page): Promise<string[]> {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(String(error)))
  await page.goto('/?debug')
  await page.waitForFunction(() => window.steampunkDebug !== undefined)
  return errors
}

function renderStats(page: Page) {
  return page.evaluate(() => {
    const result = window.steampunkDebug!.ui.getRenderStats()
    if (!result.ok) throw new Error(result.problems.join('; '))
    return result.stats
  })
}

/** Until the zoom has eased in and every visible chunk is built, the block count still moves. */
async function settledStats(page: Page) {
  let previous = -1
  await expect
    .poll(
      async () => {
        const { groundBlocks } = await renderStats(page)
        const isSettled = groundBlocks > 0 && groundBlocks === previous
        previous = groundBlocks
        return isSettled
      },
      { timeout: 60_000, intervals: [1000] },
    )
    .toBe(true)
  return renderStats(page)
}

function hudTextPixels(page: Page): Promise<string> {
  return page.evaluate(
    () => getComputedStyle(document.querySelector('[data-testid="hud-state"]')!).fontSize,
  )
}

test.describe('lit render budgets (#38)', () => {
  test('draws at most 48 ground blocks and 150 calls at 20 m, the same blocks at 1080p and 4K', async ({
    page,
  }) => {
    test.setTimeout(180_000)
    const errors = await openGame(page)
    await page.evaluate(() => {
      window.steampunkDebug!.ui.setZoom(20)
      // A low pinned scale keeps the 4K frame quick on software GL; it never changes what is drawn.
      window.steampunkDebug!.ui.setRenderScale(0.5)
    })
    await page.setViewportSize({ width: 1920, height: 1080 })
    const at1080p = await settledStats(page)
    await page.setViewportSize({ width: 3840, height: 2160 })
    const at4k = await settledStats(page)
    for (const stats of [at1080p, at4k]) {
      expect(stats.groundBlocks).toBeLessThanOrEqual(MAX_GROUND_BLOCKS)
      expect(stats.drawCalls).toBeLessThanOrEqual(MAX_DRAW_CALLS)
      expect(stats.headlamps).toBe(1)
      expect(stats.pointLights).toBeLessThanOrEqual(MAX_POINT_LIGHTS)
      expect(stats.postPasses).toBeLessThanOrEqual(6)
    }
    expect(at4k.groundBlocks).toBe(at1080p.groundBlocks)
    expect(errors).toEqual([])
  })

  test('holds the same caps with six enemies drawn from their S7c atlases (#68 acceptance 3)', async ({
    page,
  }) => {
    test.setTimeout(180_000)
    const errors = await openGame(page)
    await page.setViewportSize({ width: 1920, height: 1080 })
    const spawned = await page.evaluate(() => {
      const debug = window.steampunkDebug!
      debug.ui.setZoom(20)
      debug.ui.setRenderScale(0.5)
      debug.freezeEnemies(true)
      const offsets = [-6, -3, 3, 6, 9, -9]
      return offsets.map((dx, at) =>
        debug.spawnEnemy(at % 2 === 0 ? 'crawler' : 'burrower', 1 + at * 4, { dx, dy: -2 }),
      )
    })
    expect(spawned.every((result) => result.ok)).toBe(true)
    const stats = await settledStats(page)
    expect(stats.groundBlocks).toBeLessThanOrEqual(MAX_GROUND_BLOCKS)
    expect(stats.drawCalls).toBeLessThanOrEqual(MAX_DRAW_CALLS)
    expect(stats.headlamps).toBe(1)
    expect(stats.pointLights).toBeLessThanOrEqual(MAX_POINT_LIGHTS)
    expect(errors).toEqual([])
  })

  test('holds the same caps with the ground drawn from its five S7d strata maps (#69 acceptance 3)', async ({
    page,
  }) => {
    test.setTimeout(180_000)
    // A shader that fails to compile is logged by three, not thrown.
    const consoleErrors: string[] = []
    page.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(message.text())
    })
    const errors = await openGame(page)
    await page.setViewportSize({ width: 1920, height: 1080 })
    await page.evaluate(() => {
      window.steampunkDebug!.ui.setZoom(20)
      window.steampunkDebug!.ui.setRenderScale(0.5)
    })
    await expect
      .poll(async () => (await renderStats(page)).strataBands, { timeout: 60_000 })
      .toBe(5)
    const stats = await settledStats(page)
    expect(stats.groundBlocks).toBeLessThanOrEqual(MAX_GROUND_BLOCKS)
    expect(stats.drawCalls).toBeLessThanOrEqual(MAX_DRAW_CALLS)
    expect(stats.headlamps).toBe(1)
    expect(stats.pointLights).toBeLessThanOrEqual(MAX_POINT_LIGHTS)
    expect(errors).toEqual([])
    expect(consoleErrors.filter((text) => text.includes('THREE.'))).toEqual([])
  })

  test('keeps the UI text the same size at every render scale, because it is DOM (#38 acceptance 4)', async ({
    page,
  }) => {
    // At 4K the 1080p floor is a scale of 0.5, so both scales below are allowed.
    await page.setViewportSize({ width: 3840, height: 2160 })
    const errors = await openGame(page)
    const textAt = async (scale: number) => {
      await page.evaluate((value) => window.steampunkDebug!.ui.setRenderScale(value), scale)
      await expect
        .poll(async () => (await renderStats(page)).renderScale, { timeout: 30_000 })
        .toBe(scale)
      return hudTextPixels(page)
    }
    expect(await textAt(0.5)).toBe(await textAt(1))
    expect(errors).toEqual([])
  })
})
