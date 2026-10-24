/**
 * The P1-P5 skin contact sheet in the browser (ticket 746 under #647), read through
 * `steampunkDebug.ui.getKindLooks()`, never pixels: on a fresh save, undrilled, at a phone's 360x640
 * and a desktop's 1280x800, every kind slot of planets 1 to 5 draws the skin the committed sheet
 * holds (`src/features/roster/skinContactSheet.golden.json`: silhouette, pattern, colour, hero cell)
 * with no rarity yet, so #698's first-frame skin holds on both layouts and on every planet. Where the
 * probe refuses the atlas its unit, every hero keeps the shader look the sheet also judges. Each gem
 * glints on the step of its rank k (ticket 786: glintStep == gemRank) and no other kind glints.
 */
import { readFileSync } from 'node:fs'
import { expect, test, type Page } from '@playwright/test'
import type { DebugApi } from '../../src/debug/debugApi'

declare global {
  interface Window {
    steampunkDebug?: DebugApi
  }
}

interface SheetRow {
  slot: number
  silhouetteCode: number
  patternCode: number
  colour: string
  heroCell: number | null
}

interface GoldenRow extends SheetRow {
  /** The gem's rank k on its planet; null for a non-gem. */
  gemRank: number | null
}

const PLANET_1_START = readFileSync(
  new URL('../../scenarios/planet1-start.scenario.json', import.meta.url),
  'utf8',
)
const SHEET = JSON.parse(
  readFileSync(
    new URL('../../src/features/roster/skinContactSheet.golden.json', import.meta.url),
    'utf8',
  ),
) as { planets: { planetIndex: number; rows: GoldenRow[] }[] }
const VIEWPORTS = [
  { label: '360x640', size: { width: 360, height: 640 } },
  { label: '1280x800', size: { width: 1280, height: 800 } },
] as const
const CHANNEL_MAX = 255
const SLOW_BOX_TIMEOUT_MS = 180_000

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

function setPlanet(page: Page, planet: number) {
  return page.evaluate((index) => window.steampunkDebug!.setPlanet(index).ok, planet)
}

function hexOf(colour: readonly number[]): string {
  return `#${colour
    .map((channel) =>
      Math.round(channel * CHANNEL_MAX)
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`
}

/** What each slot draws, as the sheet names it. */
function drawnRowsOf(looks: DrawnLooks): SheetRow[] {
  return looks.shown.map((look) => ({
    slot: look.slot,
    silhouetteCode: look.silhouetteCode,
    patternCode: look.patternCode,
    colour: hexOf(look.colour),
    heroCell: look.heroCell,
  }))
}

/** The sheet's rows as this page draws them: no hero cell where the probe refused the atlas. */
function expectedRowsOf(rows: readonly SheetRow[], isAtlasDrawn: boolean): SheetRow[] {
  return rows.map(({ slot, silhouetteCode, patternCode, colour, heroCell }) => ({
    slot,
    silhouetteCode,
    patternCode,
    colour,
    heroCell: isAtlasDrawn ? heroCell : null,
  }))
}

for (const viewport of VIEWPORTS) {
  test.describe(`P1-P5 skin contact sheet at ${viewport.label} (ticket 746)`, () => {
    test.use({ viewport: viewport.size })

    test('draws every kind of planets 1 to 5 as the sheet holds it, undrilled', async ({
      page,
    }) => {
      test.setTimeout(SLOW_BOX_TIMEOUT_MS)
      const errors = await openScenario(page)
      for (const { planetIndex, rows } of SHEET.planets) {
        if (planetIndex !== 1) expect(await setPlanet(page, planetIndex)).toBe(true)
        await expect.poll(async () => (await kindLooks(page)).shown.length).toBe(rows.length)
        const { unit } = (await kindLooks(page)).heroAtlas
        const isAtlasDrawn = unit !== 'absent'
        const expected = expectedRowsOf(rows, isAtlasDrawn)
        await expect.poll(async () => drawnRowsOf(await kindLooks(page))).toEqual(expected)
        const looks = await kindLooks(page)
        expect(new Set(looks.shown.map((look) => look.rarityLead))).toEqual(new Set([0]))
        expect(looks.shown.map((look) => look.gemGlint?.step ?? null)).toEqual(
          rows.map((row) => row.gemRank),
        )
      }
      expect(errors).toEqual([])
    })
  })
}
