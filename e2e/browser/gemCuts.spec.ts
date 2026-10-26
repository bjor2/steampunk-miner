/**
 * The gem-cut library in the browser (ticket 889 under #878), read through
 * `steampunkDebug.ui.getKindLooks()`, never pixels: on a planet drawing its generated pool (P6 in
 * the P2 act, which has its own pages, and P8 in the fire act, which has none), the library's two
 * hue-tinted pages bind after the act's own as layers of one texture, the look table says where
 * the tinted cells begin, exactly the planet's three gems draw cells from there (stepping their rank
 * glint 0, 1, 2 with their price), and the planet's overlay is a pattern of the catalogue at a
 * strength within the cap. Checked at 640x360 at 15 m (24 px a cell, ticket 315's floor), 360x640
 * and 1280x800, a screenshot of each attached for the eye check ("goldens at 360 px and 1280+").
 * Where the probe refuses the atlas its unit nothing binds, and the overlay still names itself.
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
/** Cells on a page (`HERO_ATLAS_CELLS`). */
const CELLS_PER_PAGE = 16
const LIBRARY_PAGES = 2
const GEMS_PER_PLANET = 3
const OVERLAY_STRENGTH_CAP = 0.4
/** P6 draws its pool in the P2 act, whose own two pages come first; P8 in the fire act, with none. */
const PLANETS = [
  { planet: 6, act: 'foothold.heavy', ownPages: 2 },
  { planet: 8, act: 'fire', ownPages: 0 },
] as const
const SCREENS = [
  { label: 'phone 640x360 at 24 px a cell', size: { width: 640, height: 360 }, zoom: 15, px: 24 },
  { label: 'phone 360x640', size: { width: 360, height: 640 }, zoom: 12, px: 30 },
  { label: 'desktop 1280x800', size: { width: 1280, height: 800 }, zoom: 12, px: 800 / 12 },
] as const
const PX_TOLERANCE = 2
const SLOW_BOX_TIMEOUT_MS = 180_000

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
const gemCuts = async (page: Page) => (await kindLooks(page)).gemCuts

/** The slots drawing a cell at or past the first hue-tinted cell: the cuts. */
async function cutSlots(page: Page) {
  const { shown, gemCuts: cuts } = await kindLooks(page)
  const first = cuts.firstHueTintedCell ?? Number.POSITIVE_INFINITY
  return shown.filter((look) => look.heroCell !== null && look.heroCell >= first)
}

function setPlanet(page: Page, planet: number) {
  return page.evaluate((index) => window.steampunkDebug!.setPlanet(index).ok, planet)
}

async function pixelsPerMetre(page: Page): Promise<number> {
  return page.evaluate(() => {
    const read = window.steampunkDebug!.ui.getCameraView()
    return read.ok ? read.view.pixelsPerMetre : -1
  })
}

for (const screen of SCREENS) {
  for (const { planet, act, ownPages } of PLANETS) {
    test.describe(`gem cuts of P${planet} on a ${screen.label} (ticket 889)`, () => {
      test.use({ viewport: screen.size })

      test(`draws the three gems from the library's pages after the ${act} act's own, under one overlay`, async ({
        page,
      }, testInfo) => {
        test.setTimeout(SLOW_BOX_TIMEOUT_MS)
        const errors = await openScenario(page)
        expect(await setPlanet(page, planet)).toBe(true)
        expect(
          await page.evaluate((m) => window.steampunkDebug!.ui.setZoom(m).ok, screen.zoom),
        ).toBe(true)
        await expect.poll(() => pixelsPerMetre(page)).toBeGreaterThan(screen.px - PX_TOLERANCE)
        expect(await pixelsPerMetre(page)).toBeLessThan(screen.px + PX_TOLERANCE)

        const cuts = await gemCuts(page)
        expect(cuts.overlay.patternCode).toBeGreaterThan(0)
        expect(Math.abs(cuts.overlay.strength)).toBeGreaterThan(0)
        expect(Math.abs(cuts.overlay.strength)).toBeLessThanOrEqual(OVERLAY_STRENGTH_CAP)

        const { unit } = await heroAtlas(page)
        if (unit === 'absent') {
          expect((await gemCuts(page)).firstHueTintedCell).toBe(null)
          expect(await cutSlots(page)).toEqual([])
          expect(errors).toEqual([])
          return
        }

        await expect.poll(async () => (await heroAtlas(page)).residentId).toBe(act)
        await expect.poll(async () => (await heroAtlas(page)).pages).toBe(ownPages + LIBRARY_PAGES)
        await expect
          .poll(async () => (await gemCuts(page)).firstHueTintedCell)
          .toBe(ownPages * CELLS_PER_PAGE)
        await expect.poll(async () => (await cutSlots(page)).length).toBe(GEMS_PER_PLANET)
        const gems = await cutSlots(page)
        expect(gems.map((look) => look.gemGlint?.step).sort()).toEqual([0, 1, 2])
        expect(new Set(gems.map((look) => look.heroCell)).size).toBe(GEMS_PER_PLANET)
        const { shown } = await kindLooks(page)
        expect(
          shown.filter((look) => look.gemGlint === null && look.heroCell !== null),
        ).toHaveLength(
          ownPages === 0
            ? 0
            : shown.filter((look) => look.heroCell !== null).length - GEMS_PER_PLANET,
        )
        await testInfo.attach(`gem-cuts-p${planet}-${screen.size.width}x${screen.size.height}`, {
          body: await page.screenshot(),
          contentType: 'image/png',
        })
        expect(errors).toEqual([])
      })
    })
  }
}
