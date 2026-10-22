/**
 * The ground's material looks (ticket 450 under #139), read through `steampunkDebug.ui`, never
 * pixels: a fresh planet-1 start draws every kind of the planet's roster in its own silhouette,
 * pattern and colour with no rarity (GD ruling on #698, option 2: only the rarity waits for
 * contact), the debug switch adds every kind's rarity and changes no skin, and switching it links
 * no new shader program and leaves the session's digest where it was (the look never touches the
 * simulation).
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

/** What a slot draws under its rarity overlay: silhouette, pattern, colour and hero cell. */
function skinsOf(looks: Awaited<ReturnType<typeof kindLooks>>): string[] {
  return looks.shown.map(
    (look) =>
      `${look.slot}|${look.silhouetteCode}|${look.patternCode}|${look.colour.join()}|${look.heroCell}`,
  )
}

function leadsOf(looks: Awaited<ReturnType<typeof kindLooks>>): number[] {
  return looks.shown.map((look) => look.rarityLead)
}

test.describe('material looks (ticket 450)', () => {
  test('draws every kind apart on a fresh start, and only the rarity once shown', async ({
    page,
  }) => {
    const errors = await openScenario(page)
    await expect.poll(async () => (await kindLooks(page)).shown.length).toBeGreaterThan(1)
    const fresh = await kindLooks(page)
    const keys = fresh.shown.map(
      (look) => `${look.silhouetteCode}|${look.patternCode}|${look.colour.join()}`,
    )
    expect(new Set(keys).size).toBe(fresh.shown.length)
    expect(new Set(leadsOf(fresh))).toEqual(new Set([0]))
    const linkedBefore = await programs(page)
    const digestBefore = await digest(page)

    await page.evaluate(() => window.steampunkDebug!.ui.showEveryKindLook())
    await expect.poll(async () => Math.max(...leadsOf(await kindLooks(page)))).toBeGreaterThan(0)
    expect(skinsOf(await kindLooks(page))).toEqual(skinsOf(fresh))

    expect(await programs(page)).toBe(linkedBefore)
    expect(await digest(page)).toBe(digestBefore)
    await page.evaluate(() => window.steampunkDebug!.ui.showSeenKindLooksOnly())
    await expect.poll(async () => leadsOf(await kindLooks(page))).toEqual(leadsOf(fresh))
    expect(errors).toEqual([])
  })
})
