/**
 * The hero atlas's pages in the browser (ticket 852 under #647), read through
 * `steampunkDebug.ui.getKindLooks()`, never pixels. Until an act fills page 1, the debug switch
 * `ui.packHeroAtlasOverflow(true)` binds the resident act's synthetic overflow: page 1's map again
 * as page 2, every hero moved to its cell there. On a phone at 24 px a cell and at desktop size,
 * the two pages bind as one texture's two layers, every hero that drew a cell draws the same cell
 * of page 2, no bind links a new shader program and nothing errors; switching back binds page 1
 * alone with its cells as before. A screenshot of each is attached for the eye check. Where the
 * probe refuses the atlas its unit, nothing binds either way.
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
const ACT = 'foothold.base'
const OVERFLOW_ACT = `${ACT}#overflow`
/** A landscape phone at 15 m a screen height is 24 px a cell (ticket 315's phone floor). */
const SCREENS = [
  { label: 'phone 640x360 at 24 px a cell', size: { width: 640, height: 360 }, zoom: 15, px: 24 },
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

/** Each slot drawing a sprite, as `slot:cell`. */
async function heroCellsBySlot(page: Page): Promise<string[]> {
  const { shown } = await kindLooks(page)
  return shown.filter((look) => look.heroCell !== null).map((l) => `${l.slot}:${l.heroCell}`)
}

function packOverflow(page: Page, packed: boolean) {
  return page.evaluate((on) => window.steampunkDebug!.ui.packHeroAtlasOverflow(on).ok, packed)
}

function programs(page: Page) {
  return page.evaluate(() => {
    const read = window.steampunkDebug!.ui.getRendererMemory()
    return read.ok ? read.programs : -1
  })
}

async function pixelsPerMetre(page: Page): Promise<number> {
  return page.evaluate(() => {
    const read = window.steampunkDebug!.ui.getCameraView()
    return read.ok ? read.view.pixelsPerMetre : -1
  })
}

function onPageTwo(cells: readonly string[]): string[] {
  return cells.map((entry) => {
    const [slot, cell] = entry.split(':').map(Number)
    return `${slot}:${cell + CELLS_PER_PAGE}`
  })
}

for (const screen of SCREENS) {
  test.describe(`hero atlas pages on a ${screen.label} (ticket 852)`, () => {
    test.use({ viewport: screen.size })

    test('draws every hero from page 2 of a synthetic overflow and back, one program', async ({
      page,
    }, testInfo) => {
      test.setTimeout(SLOW_BOX_TIMEOUT_MS)
      const errors = await openScenario(page)
      expect(await page.evaluate((m) => window.steampunkDebug!.ui.setZoom(m).ok, screen.zoom)).toBe(
        true,
      )
      await expect.poll(() => pixelsPerMetre(page)).toBeGreaterThan(screen.px - PX_TOLERANCE)
      expect(await pixelsPerMetre(page)).toBeLessThan(screen.px + PX_TOLERANCE)
      const { unit } = await heroAtlas(page)
      if (unit === 'absent') {
        expect(await packOverflow(page, true)).toBe(true)
        expect((await heroAtlas(page)).residentId).toBe(null)
        expect(await heroCellsBySlot(page)).toEqual([])
        expect(await packOverflow(page, false)).toBe(true)
        expect(errors).toEqual([])
        return
      }

      await expect.poll(async () => (await heroAtlas(page)).residentId).toBe(ACT)
      await expect.poll(async () => (await heroCellsBySlot(page)).length).toBeGreaterThan(0)
      const pageOneCells = await heroCellsBySlot(page)
      expect((await heroAtlas(page)).pages).toBe(1)
      const linked = await programs(page)

      expect(await packOverflow(page, true)).toBe(true)
      await expect.poll(async () => (await heroAtlas(page)).residentId).toBe(OVERFLOW_ACT)
      expect((await heroAtlas(page)).pages).toBe(2)
      await expect.poll(() => heroCellsBySlot(page)).toEqual(onPageTwo(pageOneCells))
      expect(await programs(page)).toBe(linked)
      await testInfo.attach(`page-2-sprites-${screen.size.width}x${screen.size.height}`, {
        body: await page.screenshot(),
        contentType: 'image/png',
      })

      expect(await packOverflow(page, false)).toBe(true)
      await expect.poll(async () => (await heroAtlas(page)).residentId).toBe(ACT)
      expect((await heroAtlas(page)).pages).toBe(1)
      await expect.poll(() => heroCellsBySlot(page)).toEqual(pageOneCells)
      expect(errors).toEqual([])
    })
  })
}
