/**
 * The shop's guidance (ticket 719) in the preview build, read through the HUD model
 * (`steampunkDebug.ui.getHudModel()`), the Outfitter's cards and their notes, never pixels. Before
 * a trip no card says anything under its price; after a real sale every priced card says
 * "Affordable" or "{N} trips away", the chip on the surface offers the cheapest new capability
 * first, and underground it is off. At 360x640 and 1280x800 the notes and the chip stay inside
 * their boxes, and a desktop hover reveals the chip's line of 12 words or fewer.
 */
import { expect, test, type Page } from '@playwright/test'
import { UI_IDS } from '../../src/ui/ids'
import { SHEET_UI_IDS } from '../../src/ui/sheet/sheetIds'
import { dockAt } from './screens/screenHelpers'
import { openGame, sellAtTheExchange } from './sellBurstSales'

/** Software WebGL on a loaded box is slow; this is a wait, not a judgement. */
const TEST_TIMEOUT_MS = 240_000
const OPEN_TIMEOUT_MS = 30_000
const HOVER_WORDS_MAX = 12
const GUIDANCE = /^(Affordable|\S{1,6} trips? away)$/

interface ChipReading {
  kind: 'capability' | 'track'
  offerKey: string
  guidanceText: string | null
}

function chipNow(page: Page): Promise<ChipReading> {
  return page.evaluate(() => {
    const result = window.steampunkDebug!.ui.getHudModel()
    if (!result.ok) throw new Error(result.problems.join('; '))
    return result.model.nextUpgrade
  })
}

async function openOutfitter(page: Page): Promise<void> {
  await dockAt(page, 'upgrade')
  await expect(page.getByTestId(SHEET_UI_IDS.outfitterCards)).toBeVisible({
    timeout: OPEN_TIMEOUT_MS,
  })
}

function cardNotes(page: Page) {
  return page.getByTestId(SHEET_UI_IDS.outfitterCards).locator('[data-sheet-card-note]')
}

/** Every note's right edge against its card's: a note never spills out of its card. */
function notesSpillingOutOfCards(page: Page): Promise<string[]> {
  return page.evaluate(() =>
    [...document.querySelectorAll('[data-sheet-card-note]')].flatMap((note) => {
      const card = note.closest('[data-sheet-card]')
      if (card === null) return ['a note outside a card']
      const spills = note.getBoundingClientRect().right > card.getBoundingClientRect().right + 0.5
      return spills ? [card.getAttribute('data-sheet-card') ?? '?'] : []
    }),
  )
}

test.describe('shop guidance (ticket 719)', () => {
  test('no card says how far off it is before a trip; every priced card does after one', async ({
    page,
  }) => {
    test.setTimeout(TEST_TIMEOUT_MS)
    const errors = await openGame(page)
    await openOutfitter(page)
    await expect(cardNotes(page)).toHaveCount(0)
    expect((await chipNow(page)).guidanceText).toBeNull()
    await sellAtTheExchange(page, { legs: [{ planet: 1, tiles: 4 }], sells: ['all'] })
    await openOutfitter(page)
    await expect
      .poll(() => cardNotes(page).count(), { timeout: OPEN_TIMEOUT_MS })
      .toBeGreaterThan(0)
    for (const text of await cardNotes(page).allTextContents()) expect(text).toMatch(GUIDANCE)
    expect((await chipNow(page)).guidanceText).toMatch(GUIDANCE)
    expect(errors).toEqual([])
  })

  test('the surface chip puts a new capability first and is off underground', async ({ page }) => {
    test.setTimeout(TEST_TIMEOUT_MS)
    const errors = await openGame(page)
    await expect(page.getByTestId(UI_IDS.hudNextUpgrade)).toBeVisible({ timeout: OPEN_TIMEOUT_MS })
    expect((await chipNow(page)).kind).toBe('capability')
    await page.evaluate(() => {
      const result = window.steampunkDebug!.teleportToDepthTiles(12)
      if (!result.ok) throw new Error(result.problems.join('; '))
    })
    await expect(page.getByTestId(UI_IDS.hudNextUpgrade)).toHaveCount(0, {
      timeout: OPEN_TIMEOUT_MS,
    })
    expect(errors).toEqual([])
  })
})

for (const size of [
  { width: 360, height: 640, isPhone: true },
  { width: 1280, height: 800, isPhone: false },
]) {
  test.describe(`shop guidance at ${size.width}x${size.height} (ticket 719)`, () => {
    test.use({
      viewport: { width: size.width, height: size.height },
      hasTouch: size.isPhone,
      isMobile: size.isPhone,
    })

    test('the notes stay inside their cards and the chip inside the strip', async ({ page }) => {
      test.setTimeout(TEST_TIMEOUT_MS)
      const errors = await openGame(page)
      await sellAtTheExchange(page, { legs: [{ planet: 1, tiles: 4 }], sells: ['all'] })
      await openOutfitter(page)
      await expect
        .poll(() => cardNotes(page).count(), { timeout: OPEN_TIMEOUT_MS })
        .toBeGreaterThan(0)
      expect(await notesSpillingOutOfCards(page)).toEqual([])
      const strip = await page.getByTestId(UI_IDS.hudStrip).boundingBox()
      const chip = await page.getByTestId(UI_IDS.hudNextUpgrade).boundingBox()
      expect(strip).not.toBeNull()
      expect(chip).not.toBeNull()
      expect(chip!.x + chip!.width).toBeLessThanOrEqual(strip!.x + strip!.width + 0.5)
      expect(chip!.x + chip!.width).toBeLessThanOrEqual(size.width)
      expect(errors).toEqual([])
    })

    if (!size.isPhone) {
      test('a hover on the chip reveals its line of 12 words or fewer', async ({ page }) => {
        test.setTimeout(TEST_TIMEOUT_MS)
        const errors = await openGame(page)
        await page.getByTestId(UI_IDS.hudNextUpgrade).hover()
        const line = page.locator('[data-chip-hover]')
        await expect(line).toBeVisible({ timeout: OPEN_TIMEOUT_MS })
        const words = ((await line.textContent()) ?? '').trim().split(/\s+/)
        expect(words.length).toBeLessThanOrEqual(HOVER_WORDS_MAX)
        expect(errors).toEqual([])
      })
    }
  })
}
