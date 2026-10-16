/**
 * The render quality knob and the GPU capability probe (ticket 477, TD #470 section 2): read
 * through `steampunkDebug.ui.getRenderStats()` and the run log, never pixels. With the render scale
 * pinned, every quality preset draws live frames and the session then reaches the same digest at
 * the same tick (the knob never changes the sim); the probe is logged once as `gpu_capabilities`
 * and its readings show in the render stats; a coarse pointer draws #173's phone cuts (half the
 * particles, the reduced background). SwiftShader is allowed here for correctness only.
 */
import { readFileSync } from 'node:fs'
import { expect, test, type Browser, type Page } from '@playwright/test'
import type { DebugApi } from '../../src/debug/debugApi'

declare global {
  interface Window {
    steampunkDebug?: DebugApi
    steampunkRunLog?: () => string
  }
}

const PLANET_1_START = readFileSync(
  new URL('../../scenarios/planet1-start.scenario.json', import.meta.url),
  'utf8',
)
/** The committed start scenario waits here for play (its script). */
const SCENARIO_END_TICK = 7200
/** Live ticks drawn at the preset before the pause: about 2 s of frames. */
const LIVE_TICKS = 120
/** Every preset's run is stepped on to this tick, past wherever its live run paused. */
const COMPARED_TICK = SCENARIO_END_TICK + 1200

/**
 * Opens the game waiting at the scenario's end and collects every console and page error. The
 * render scale is pinned, which also holds the quality ladder, so software GL's slow frames
 * never lower the preset under test.
 */
async function openScenario(page: Page): Promise<string[]> {
  const errors: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })
  page.on('pageerror', (error) => errors.push(String(error)))
  await page.goto(`/?debug&scenario=${encodeURIComponent(PLANET_1_START)}`)
  await page.waitForFunction(() => window.steampunkDebug !== undefined)
  await page.evaluate(() => window.steampunkDebug!.ui.setRenderScale(0.5))
  return errors
}

function renderStats(page: Page) {
  return page.evaluate(() => {
    const result = window.steampunkDebug!.ui.getRenderStats()
    if (!result.ok) throw new Error(result.problems.join('; '))
    return result.stats
  })
}

function sessionTick(page: Page): Promise<number> {
  return page.evaluate(() => {
    const taken = window.steampunkDebug!.snapshot()
    return taken.ok ? taken.snapshot.tick : -1
  })
}

/** Plays live at `choice` for a couple of seconds of frames, then steps on to the compared tick. */
async function digestAfterLivePlay(browser: Browser, choice: string) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } })
  const errors = await openScenario(page)
  await page.evaluate((quality) => window.steampunkDebug!.ui.setRenderQuality(quality), choice)
  await expect.poll(async () => (await renderStats(page)).quality.choice).toBe(choice)
  await page.evaluate(() => window.steampunkDebug!.resume())
  await expect
    .poll(() => sessionTick(page), { timeout: 60_000 })
    .toBeGreaterThanOrEqual(SCENARIO_END_TICK + LIVE_TICKS)
  const paused = await page.evaluate(() => window.steampunkDebug!.pause())
  if (!paused.ok) throw new Error(paused.problems.join('; '))
  const stats = await renderStats(page)
  const stepped = await page.evaluate(
    (ticks) => window.steampunkDebug!.step(ticks),
    COMPARED_TICK - paused.tick,
  )
  await page.close()
  return { stats, stepped, errors }
}

test.describe('render quality (ticket 477)', () => {
  test('reaches the same digest at the same tick under every quality preset', async ({
    browser,
  }) => {
    test.setTimeout(300_000)
    const runs = []
    for (const choice of ['high', 'mid', 'low', 'auto']) {
      runs.push(await digestAfterLivePlay(browser, choice))
    }
    for (const run of runs) {
      expect(run.stepped).toMatchObject({ ok: true, tick: COMPARED_TICK })
      expect(run.stats.drawCalls).toBeGreaterThan(0)
      expect(run.stats.isRenderScalePinned).toBe(true)
      expect(run.errors).toEqual([])
    }
    const digests = runs.map((run) => (run.stepped.ok ? run.stepped.digest : null))
    expect(new Set(digests).size).toBe(1)
    expect(runs.map((run) => run.stats.quality.preset).slice(0, 3)).toEqual(['high', 'mid', 'low'])
  })

  test('logs the GPU probe once and shows its readings in the render stats', async ({ page }) => {
    const errors = await openScenario(page)
    await expect.poll(async () => (await renderStats(page)).gpu).not.toBeNull()
    const stats = await renderStats(page)
    expect(stats.gpu!.textureUnits).toBeGreaterThanOrEqual(16)
    expect(stats.gpu!.maxTextureSize).toBeGreaterThanOrEqual(2048)
    expect(stats.quality.terrainProgram).toBe('full')
    await expect(page.getByTestId('unsupported-device-card')).toHaveCount(0)
    const lines = await page.evaluate(() =>
      (window.steampunkRunLog?.() ?? '')
        .split('\n')
        .filter((line) => line.includes('"event":"gpu_capabilities"')),
    )
    expect(lines).toHaveLength(1)
    expect(JSON.parse(lines[0]).data).toMatchObject({
      textureUnits: stats.gpu!.textureUnits,
      terrainProgram: stats.quality.terrainProgram,
      sceneTarget: stats.quality.sceneTarget,
    })
    expect(errors).toEqual([])
  })

  test('draws a desktop pointer at the high preset, with every particle and the sky band', async ({
    page,
  }) => {
    const errors = await openScenario(page)
    await expect.poll(async () => (await renderStats(page)).gpu).not.toBeNull()
    expect((await renderStats(page)).quality).toMatchObject({
      choice: 'auto',
      preset: 'high',
      particleShare: 1,
      parallaxLayers: 2,
    })
    expect(errors).toEqual([])
  })
})

test.describe('render quality on a phone (ticket 477, #173 section 3)', () => {
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 844, height: 390 } })

  test('halves the particles and drops the sky band on a coarse pointer', async ({ page }) => {
    const errors = await openScenario(page)
    await expect.poll(async () => (await renderStats(page)).gpu).not.toBeNull()
    expect((await renderStats(page)).quality).toMatchObject({
      choice: 'auto',
      preset: 'mid',
      particleShare: 0.5,
      parallaxLayers: 1,
    })
    expect(errors).toEqual([])
  })
})
