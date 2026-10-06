/**
 * The debug API's memory reads (#119), on the preview build: `getPhysicsStats()` and
 * `ui.getRendererMemory()` answer while the game runs and move as the vehicle drives off the pad and
 * drills down, streaming ground colliders and chunk meshes in and out. The memory soak (#99) reads
 * the same two calls instead of hooking three and Rapier from outside.
 */
import { expect, test, type Page } from '@playwright/test'
import type { DebugApi } from '../../src/debug/debugApi'

declare global {
  interface Window {
    steampunkDebug?: DebugApi
  }
}

const WASM_PAGE_BYTES = 65536
/** Held long enough on software GL to leave the pad and bore a few tiles. */
const LEG_MS = 6000
const SAMPLE_EVERY_MS = 1000

async function openGame(page: Page): Promise<string[]> {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(String(error)))
  await page.goto('/?debug')
  await page.waitForFunction(() => window.steampunkDebug!.getPhysicsStats().ok, null, {
    timeout: 60_000,
  })
  await page.waitForFunction(() => window.steampunkDebug!.ui.getRendererMemory().ok)
  return errors
}

/** A drill that cuts at once and nothing to fight, so the legs only drive and drill. */
function readyToDrill(page: Page) {
  return page.evaluate(() => {
    const debug = window.steampunkDebug!
    for (const track of ['drill_power', 'drill_tip', 'engine']) debug.setUpgrade(track, 30)
    debug.freezeEnemies(true)
  })
}

function memoryNow(page: Page) {
  return page.evaluate(() => {
    const physics = window.steampunkDebug!.getPhysicsStats()
    const renderer = window.steampunkDebug!.ui.getRendererMemory()
    if (!physics.ok || !renderer.ok) throw new Error('a memory read refused')
    return { physics, renderer }
  })
}

async function holdAndSample(page: Page, action: string) {
  const samples = []
  await page.evaluate((id) => window.steampunkDebug!.input.press(id), action)
  for (let waited = 0; waited < LEG_MS; waited += SAMPLE_EVERY_MS) {
    await page.waitForTimeout(SAMPLE_EVERY_MS)
    samples.push(await memoryNow(page))
  }
  await page.evaluate((id) => window.steampunkDebug!.input.release(id), action)
  return samples
}

test.describe('debug memory reads (#119)', () => {
  test('reads the physics world and renderer, and both move as the vehicle drives and drills', async ({
    page,
  }) => {
    test.setTimeout(120_000)
    const errors = await openGame(page)
    await readyToDrill(page)
    const samples = [
      await memoryNow(page),
      ...(await holdAndSample(page, 'aim_right')),
      ...(await holdAndSample(page, 'aim_down')),
    ]
    for (const { physics, renderer } of samples) {
      expect(physics.rigidBodies).toBe(1)
      expect(physics.colliders).toBeGreaterThan(1)
      expect(physics.wasmBytes % WASM_PAGE_BYTES).toBe(0)
      expect(physics.wasmBytes).toBeGreaterThan(0)
      expect(renderer.geometries).toBeGreaterThan(0)
      expect(renderer.textures).toBeGreaterThan(0)
      expect(renderer.programs).toBeGreaterThan(0)
    }
    const colliderCounts = new Set(samples.map(({ physics }) => physics.colliders))
    expect(colliderCounts.size).toBeGreaterThan(1)
    expect(errors).toEqual([])
  })
})
