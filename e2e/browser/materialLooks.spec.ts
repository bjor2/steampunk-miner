/**
 * The ground's material looks (ticket 450 under #139), read through `steampunkDebug.ui`, never
 * pixels: a fresh planet-1 start shows no species (Horizontal Scaler's condition a: an unseen kind
 * draws its family look), the debug switch draws every kind of the planet's roster, each with its
 * own silhouette, pattern and colour, and switching the look on links no new shader program and
 * leaves the session's digest where it was (the look never touches the simulation).
 */
import { readFileSync } from 'node:fs'
import { expect, test, type Page } from '@playwright/test'
import type { DebugApi } from '../../src/debug/debugApi'

declare global {
  interface Window {
    steampunkDebug?: DebugApi
  }
}

const PLANET_1_START = readFileSync(
  new URL('../../scenarios/planet1-start.scenario.json', import.meta.url),
  'utf8',
)

async function openScenario(page: Page): Promise<string[]> {
  const errors: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })
  page.on('pageerror', (error) => errors.push(String(error)))
  await page.goto(`/?debug&scenario=${encodeURIComponent(PLANET_1_START)}`)
  await page.waitForFunction(() => window.steampunkDebug !== undefined)
  await page.waitForFunction(() => window.steampunkDebug!.ui.getRenderStats().ok)
  return errors
}

function kindLooks(page: Page) {
  return page.evaluate(() => {
    const read = window.steampunkDebug!.ui.getKindLooks()
    if (!read.ok) throw new Error(read.problems.join('; '))
    return read.looks
  })
}

function programs(page: Page) {
  return page.evaluate(() => {
    const read = window.steampunkDebug!.ui.getRendererMemory()
    return read.ok ? read.programs : -1
  })
}

function digest(page: Page) {
  return page.evaluate(() => {
    const taken = window.steampunkDebug!.snapshot()
    return taken.ok ? taken.snapshot.digest : null
  })
}

test.describe('material looks (ticket 450)', () => {
  test('draws no species on a fresh start, then every kind apart once shown', async ({ page }) => {
    const errors = await openScenario(page)
    await expect.poll(async () => (await kindLooks(page)).shown).toEqual([])
    const linkedBefore = await programs(page)
    const digestBefore = await digest(page)

    await page.evaluate(() => window.steampunkDebug!.ui.showEveryKindLook())
    await expect.poll(async () => (await kindLooks(page)).shown.length).toBeGreaterThan(1)
    const { shown } = await kindLooks(page)
    const keys = shown.map(
      (look) => `${look.silhouetteCode}|${look.patternCode}|${look.colour.join()}`,
    )
    expect(new Set(keys).size).toBe(shown.length)

    expect(await programs(page)).toBe(linkedBefore)
    expect(await digest(page)).toBe(digestBefore)
    await page.evaluate(() => window.steampunkDebug!.ui.showSeenKindLooksOnly())
    await expect.poll(async () => (await kindLooks(page)).shown).toEqual([])
    expect(errors).toEqual([])
  })
})
