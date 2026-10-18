/**
 * The per-act hero atlas (ticket 451 under #139), read through `steampunkDebug.ui.getKindLooks()`,
 * never pixels. Where the probe gives the atlas the 16th unit, planet 1 binds the foothold.base
 * atlas, a seen hero draws from its cell, a planet change into another act binds that act's atlas
 * once, a planet change inside an act binds none, and no bind links a new shader program. Where
 * the probe refuses the unit, nothing binds and every hero keeps the shader look.
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

const heroAtlas = async (page: Page) => (await kindLooks(page)).heroAtlas

async function heroCellsDrawn(page: Page): Promise<number> {
  const { shown } = await kindLooks(page)
  return shown.filter((look) => look.heroCell !== null).length
}

function programs(page: Page) {
  return page.evaluate(() => {
    const read = window.steampunkDebug!.ui.getRendererMemory()
    return read.ok ? read.programs : -1
  })
}

function setPlanet(page: Page, planet: number) {
  return page.evaluate((index) => window.steampunkDebug!.setPlanet(index).ok, planet)
}

test.describe('hero atlas (ticket 451)', () => {
  test('binds an act’s atlas once per change of act and never recompiles', async ({ page }) => {
    const errors = await openScenario(page)
    const { unit } = await heroAtlas(page)
    await page.evaluate(() => window.steampunkDebug!.ui.showEveryKindLook())
    if (unit === 'absent') {
      await expect.poll(async () => (await kindLooks(page)).shown.length).toBeGreaterThan(1)
      expect(await heroCellsDrawn(page)).toBe(0)
      expect((await heroAtlas(page)).residentId).toBe(null)
      expect(errors).toEqual([])
      return
    }

    await expect.poll(async () => (await heroAtlas(page)).residentId).toBe('foothold.base')
    await expect.poll(() => heroCellsDrawn(page)).toBeGreaterThan(0)
    const linked = await programs(page)
    const firstBinds = (await heroAtlas(page)).binds

    expect(await setPlanet(page, 2)).toBe(true)
    await expect.poll(async () => (await heroAtlas(page)).residentId).toBe('foothold.heavy')
    expect((await heroAtlas(page)).binds).toBe(firstBinds + 1)

    expect(await setPlanet(page, 3)).toBe(true)
    // A swap would unbind at once; frames enough for one to have landed show none did.
    await page.waitForTimeout(1500)
    expect((await heroAtlas(page)).residentId).toBe('foothold.heavy')
    expect((await heroAtlas(page)).binds).toBe(firstBinds + 1)

    expect(await setPlanet(page, 8)).toBe(true)
    await expect.poll(async () => (await heroAtlas(page)).residentId).toBe(null)
    expect(await heroCellsDrawn(page)).toBe(0)
    expect(await programs(page)).toBe(linked)
    await page.evaluate(() => window.steampunkDebug!.ui.showSeenKindLooksOnly())
    expect(errors).toEqual([])
  })
})
