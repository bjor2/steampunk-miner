/**
 * The gem-read test of P2's three hero gems (ticket 744 under #741, done-when 9 of #647), read
 * through `steampunkDebug.ui.getKindLooks()`, never pixels: on a fresh planet 2, at a phone's
 * 360x640 and a desktop's 1280x800, Star Garnet, Verdigris Opal and Aquamarine draw their own
 * cells of the foothold.heavy atlas, and every one of the planet's 15 slots draws a skin
 * (silhouette, pattern, colour, hero cell) no other slot shares. Where the probe refuses the atlas
 * its unit, the gems keep the shader look and the 15 skins still read apart.
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
const PLANET_2 = 2
const HEAVY_ACT = 'foothold.heavy'
/** A fresh P2's 15 kind slots (ticket 709). */
const P2_SLOTS = 15
/**
 * The gem rows' roster slots (legacy.r1, r2 and r4: Star Garnet `p2-r1`, Verdigris Opal `p2-r2`,
 * Aquamarine `p2-r4`) and the cells `heroAtlases.json` packs them at, after the legacy four.
 */
const GEM_CELL_BY_SLOT: Record<number, number> = { 10: 4, 11: 5, 14: 6 }
const VIEWPORTS = [
  { label: '360x640', size: { width: 360, height: 640 } },
  { label: '1280x800', size: { width: 1280, height: 800 } },
] as const

async function openScenario(page: Page): Promise<string[]> {
  const errors: string[] = []
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

type DrawnLooks = Awaited<ReturnType<typeof kindLooks>>

/** What a slot draws under its rarity overlay: the sprite key of the gem-read test. */
function skinKeyOf(look: DrawnLooks['shown'][number]): string {
  return `${look.silhouetteCode}|${look.patternCode}|${look.colour.join()}|${look.heroCell}`
}

function setPlanet(page: Page, planet: number) {
  return page.evaluate((index) => window.steampunkDebug!.setPlanet(index).ok, planet)
}

for (const viewport of VIEWPORTS) {
  test.describe(`P2 gem skins at ${viewport.label} (ticket 744)`, () => {
    test.use({ viewport: viewport.size })

    test('draws the three gems from their cells and no two of the 15 skins alike', async ({
      page,
    }) => {
      const errors = await openScenario(page)
      expect(await setPlanet(page, PLANET_2)).toBe(true)
      await expect.poll(async () => (await kindLooks(page)).shown.length).toBe(P2_SLOTS)

      const { unit } = (await kindLooks(page)).heroAtlas
      if (unit !== 'absent') {
        await expect.poll(async () => (await kindLooks(page)).heroAtlas.residentId).toBe(HEAVY_ACT)
      }
      const looks = await kindLooks(page)

      const gemCells = Object.fromEntries(
        looks.shown
          .filter((look) => look.slot in GEM_CELL_BY_SLOT)
          .map((look) => [look.slot, look.heroCell]),
      )
      const expectedCells = Object.fromEntries(
        Object.entries(GEM_CELL_BY_SLOT).map(([slot, cell]) => [
          slot,
          unit === 'absent' ? null : cell,
        ]),
      )
      expect(gemCells).toEqual(expectedCells)
      expect(
        looks.shown.filter((look) => !(look.slot in GEM_CELL_BY_SLOT) && look.heroCell !== null),
      ).toEqual([])

      const keys = looks.shown.map(skinKeyOf)
      expect(new Set(keys).size).toBe(keys.length)
      expect(errors).toEqual([])
    })
  })
}
