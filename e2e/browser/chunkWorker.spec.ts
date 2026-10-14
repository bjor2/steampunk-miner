/**
 * The chunk worker (TD scope c2 on #316, ticket 337), on the preview build: Vite bundles it, it
 * loads the slices and takes over the terrain's meshes, and while the rig drills down at the dig
 * speed's cap no chunk in view goes a frame without its mesh and the terrain's main-thread work
 * stays within the 2 ms of #4 at p95. Each frame is read in the page from the debug API's render
 * stats; the 480 m/s figure is `npm run bench:render`'s (the rig's speed bound is far below it).
 */
import { expect, test, type Page } from '@playwright/test'
import type { DebugApi } from '../../src/debug/debugApi'

declare global {
  interface Window {
    steampunkDebug?: DebugApi
    chunkWorkerFrames?: ChunkFrames
  }
}

/** What the page counts each frame while the rig drills. */
interface ChunkFrames {
  frames: number
  framesWithUnbuiltVisible: number
  terrainMs: number[]
}

const TERRAIN_BUDGET_P95_MS = 2
/** Long enough on software GL to drive off the pad before drilling down. */
const DRIVE_OFF_PAD_MS = 6000
const DRILL_MS = 15_000

async function openGame(page: Page): Promise<string[]> {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(String(error)))
  page.on('console', (message) => {
    if (message.type() === 'error' && message.text().includes('chunk worker'))
      errors.push(message.text())
  })
  await page.goto('/?debug')
  await page.waitForFunction(() => window.steampunkDebug?.getPhysicsStats().ok === true, null, {
    timeout: 60_000,
  })
  return errors
}

function isWorkerMeshing(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const result = window.steampunkDebug!.ui.getRenderStats()
    return result.ok && result.stats.isTerrainWorkerMeshing
  })
}

/** Maxed drill and engine, no enemies, off the pad, then down until stopped. */
async function drillDown(page: Page): Promise<void> {
  await page.evaluate(() => {
    const debug = window.steampunkDebug!
    for (const track of ['drill_power', 'drill_tip', 'engine']) debug.setUpgrade(track, 300)
    debug.freezeEnemies(true)
    debug.input.press('aim_right')
  })
  await page.waitForTimeout(DRIVE_OFF_PAD_MS)
  await page.evaluate(() => {
    window.steampunkDebug!.input.release('aim_right')
    window.steampunkDebug!.input.press('aim_down')
  })
}

/** Counts every animation frame from now on in the page. */
function countFrames(page: Page): Promise<void> {
  return page.evaluate(() => {
    const counted: ChunkFrames = { frames: 0, framesWithUnbuiltVisible: 0, terrainMs: [] }
    window.chunkWorkerFrames = counted
    const countFrame = () => {
      const result = window.steampunkDebug!.ui.getRenderStats()
      if (result.ok) {
        counted.frames++
        if (result.stats.unbuiltVisibleChunks > 0) counted.framesWithUnbuiltVisible++
        counted.terrainMs.push(result.stats.terrainMs)
      }
      requestAnimationFrame(countFrame)
    }
    requestAnimationFrame(countFrame)
  })
}

function percentile(values: readonly number[], fraction: number): number {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))]
}

test.describe('chunk generation and meshing worker (ticket 337)', () => {
  test('meshes the terrain in the worker once it has loaded the slices', async ({ page }) => {
    const errors = await openGame(page)
    await expect.poll(() => isWorkerMeshing(page), { timeout: 30_000 }).toBe(true)
    expect(errors).toEqual([])
  })

  test('keeps every chunk in view built and the terrain within 2 ms at p95 while drilling', async ({
    page,
  }) => {
    test.setTimeout(120_000)
    const errors = await openGame(page)
    await expect.poll(() => isWorkerMeshing(page), { timeout: 30_000 }).toBe(true)
    await drillDown(page)
    await countFrames(page)
    await page.waitForTimeout(DRILL_MS)
    const counted = await page.evaluate(() => window.chunkWorkerFrames!)
    expect(counted.frames).toBeGreaterThan(0)
    expect(counted.framesWithUnbuiltVisible).toBe(0)
    expect(percentile(counted.terrainMs, 0.95)).toBeLessThanOrEqual(TERRAIN_BUDGET_P95_MS)
    expect(await isWorkerMeshing(page)).toBe(true)
    expect(errors).toEqual([])
  })
})
