/**
 * Browser smoke test (#29 CI and Playwright detail): Chromium on the preview build, opened with
 * `?debug&scenario=<committed file>`. Every assertion reads state through `window.steampunkDebug`
 * and the run log handles, never pixels.
 */
import { readFileSync } from 'node:fs'
import { expect, test, type Page } from '@playwright/test'
import type { DebugApi, SessionPoint } from '../../src/debug/debugApi'

declare global {
  interface Window {
    steampunkDebug?: DebugApi
    steampunkRunLog?: () => string
  }
}

const readScenario = (name: string) =>
  readFileSync(new URL(`../../scenarios/${name}`, import.meta.url), 'utf8')

const PLANET_1_START = readScenario('planet1-start.scenario.json')
const BROKEN = readScenario('broken.scenario.json')
/** The committed start scenario fast-forwards this far (its script). */
const SCENARIO_END_TICK = 7200

/** Opens the game and collects every console error and uncaught page error it shows. */
async function openGame(page: Page, query: string): Promise<string[]> {
  const errors: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })
  page.on('pageerror', (error) => errors.push(String(error)))
  await page.goto(`/?${query}`)
  await page.waitForFunction(() => window.steampunkDebug !== undefined)
  return errors
}

const scenarioQuery = (text: string) => `debug&scenario=${encodeURIComponent(text)}`

function fastForward(page: Page, ticks: number): Promise<SessionPoint> {
  return page.evaluate((count) => {
    const result = window.steampunkDebug!.fastForward(count)
    if (!result.ok) throw new Error(result.problems.join('; '))
    return { tick: result.tick, digest: result.digest }
  }, ticks)
}

test.describe('browser smoke (#29)', () => {
  test('starts a committed scenario from ?scenario= with the run log and the debug API', async ({
    page,
  }) => {
    const errors = await openGame(page, scenarioQuery(PLANET_1_START))
    const tick = await page.evaluate(() => {
      const snapshot = window.steampunkDebug!.snapshot()
      return snapshot.ok ? snapshot.snapshot.tick : -1
    })
    expect(tick).toBe(SCENARIO_END_TICK)
    await expect
      .poll(() => page.evaluate(() => window.steampunkRunLog?.() ?? ''))
      .toContain('"event":"game_started"')
    expect(errors).toEqual([])
  })

  test('answers the example slice under steampunkDebug.features (#156)', async ({ page }) => {
    const errors = await openGame(page, 'debug')
    const answer = await page.evaluate(() => window.steampunkDebug!.features.example.describe())
    expect(answer).toEqual({ ok: true, sliceId: 'example', registers: ['debugActions'] })
    expect(errors).toEqual([])
  })

  test('reaches the same digest through ?scenario= and through applyScenario', async ({
    browser,
  }) => {
    const viaLaunch = await browser.newPage()
    const launchErrors = await openGame(viaLaunch, scenarioQuery(PLANET_1_START))
    const launched = await fastForward(viaLaunch, 600)
    const viaApi = await browser.newPage()
    const apiErrors = await openGame(viaApi, 'debug')
    await viaApi.evaluate(
      (text) => window.steampunkDebug!.applyScenario(JSON.parse(text)),
      PLANET_1_START,
    )
    const applied = await fastForward(viaApi, 600)
    expect(applied).toEqual(launched)
    expect(launched.digest).toMatch(/^[0-9a-f]{16}$/)
    expect([...launchErrors, ...apiErrors]).toEqual([])
  })

  test('restores a snapshot and reproduces the digest of the same fast-forward', async ({
    page,
  }) => {
    const errors = await openGame(page, scenarioQuery(PLANET_1_START))
    const snapshot = await page.evaluate(() => {
      const taken = window.steampunkDebug!.snapshot()
      return taken.ok ? taken.snapshot : null
    })
    const first = await fastForward(page, 3600)
    const restored = await page.evaluate((taken) => window.steampunkDebug!.restore(taken), snapshot)
    expect(restored).toMatchObject({ ok: true, tick: SCENARIO_END_TICK })
    expect(await fastForward(page, 3600)).toEqual(first)
    expect(errors).toEqual([])
  })

  test('refuses an invalid scenario with its problem list and changes nothing', async ({
    page,
  }) => {
    const errors = await openGame(page, 'debug')
    const outcome = await page.evaluate((text) => {
      const before = window.steampunkDebug!.snapshot()
      const refused = window.steampunkDebug!.applyScenario(JSON.parse(text))
      const after = window.steampunkDebug!.snapshot()
      return { refused, isUnchanged: JSON.stringify(before) === JSON.stringify(after) }
    }, BROKEN)
    expect(outcome.refused).toMatchObject({ ok: false })
    expect(outcome.refused.ok ? [] : outcome.refused.problems).toContain(
      'scenario.start.fuel is not a scenario field',
    )
    expect(outcome.isUnchanged).toBe(true)
    expect(errors).toEqual([])
  })

  for (const viewport of [
    { width: 1920, height: 1080 },
    { width: 3840, height: 2160 },
  ]) {
    test(`frames 12 m at ${viewport.width}x${viewport.height} and zooms within 8 m to 20 m (#39)`, async ({
      page,
    }) => {
      await page.setViewportSize(viewport)
      const errors = await openGame(page, 'debug')
      // The camera reports the canvas once it has drawn its first frame.
      await expect
        .poll(async () => (await readCameraView(page)).pixelsPerMetre)
        .toBeCloseTo(viewport.height / 12, 6)
      const view = await readCameraView(page)
      expect(view.viewShortAxisMetres).toBe(12)
      expect(view.vehicleColliderShare).toBeCloseTo(0.075, 2)
      await tapRepeatedly(page, 'zoom_out', 6)
      await expectCameraViewSettlesAt(page, 20)
      await tapRepeatedly(page, 'zoom_in', 6)
      await expectCameraViewSettlesAt(page, 8)
      await tapRepeatedly(page, 'zoom_reset', 1)
      await expectCameraViewSettlesAt(page, 12)
      expect(errors).toEqual([])
    })
  }
})

async function readCameraView(page: Page) {
  return page.evaluate(() => {
    const result = window.steampunkDebug!.ui.getCameraView()
    if (!result.ok) throw new Error(result.problems.join('; '))
    return result.view
  })
}

function expectCameraViewSettlesAt(page: Page, metres: number): Promise<void> {
  return expect
    .poll(async () => (await readCameraView(page)).viewShortAxisMetres)
    .toBeCloseTo(metres, 6)
}

function tapRepeatedly(page: Page, actionId: string, times: number): Promise<void> {
  return page.evaluate(
    ({ actionId, times }) => {
      for (let i = 0; i < times; i++) window.steampunkDebug!.input.tap(actionId)
    },
    { actionId, times },
  )
}
