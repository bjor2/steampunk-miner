/**
 * Scrapping a save slot from the pause menu (ticket 704), on the preview build at 360x640 and
 * 1280x800: a saved slot's Scrap asks "Scrap {slotName}? This can't be undone." with Keep focused,
 * Keep leaves the slot in the index, and the second Scrap empties it and logs `save_deleted`.
 * Driven through `window.steampunkDebug` and the menu keys only; asserts state (the slot index,
 * the model, focus, the question's box inside the viewport), never pixels.
 */
import { expect, test, type Page } from '@playwright/test'
import type { DebugApi } from '../../src/debug/debugApi'

declare global {
  interface Window {
    steampunkDebug?: DebugApi
    steampunkRunLog?: () => string
  }
}

/** The longest name the save field takes (`SAVE_NAME_MAX_CHARS`), so the question wraps at most. */
const SAVE_NAME = 'Scrap me before the deep vein, go on now'
const SLOT = 'slot-1'
const VIEWPORTS = [
  { width: 360, height: 640 },
  { width: 1280, height: 800 },
]

function collectErrors(page: Page): string[] {
  const errors: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })
  page.on('pageerror', (error) => errors.push(String(error)))
  return errors
}

async function openDebugGame(page: Page): Promise<void> {
  await page.goto('/?debug')
  await page.waitForFunction(() => window.steampunkDebug!.getPhysicsStats().ok, null, {
    timeout: 60_000,
  })
}

function tap(page: Page, actionId: string): Promise<void> {
  return page.evaluate((action) => {
    const result = window.steampunkDebug!.input.tap(action)
    if (!result.ok) throw new Error(result.problems.join('; '))
  }, actionId)
}

async function waitForSlotList(page: Page): Promise<void> {
  await page.waitForFunction(() => {
    const result = window.steampunkDebug!.ui.getPauseMenuModel()
    return result.ok && result.model?.slots[0].title !== 'Reading saves…'
  })
}

function waitForSlotListed(page: Page, slot: string, isListed: boolean): Promise<unknown> {
  return page.waitForFunction(
    async ([key, listed]) => {
      const result = await window.steampunkDebug!.saves.list()
      return result.ok && result.entries.some((entry) => entry.slot === key) === listed
    },
    [slot, isListed] as const,
  )
}

function scrapQuestion(page: Page): Promise<string | null> {
  return page.evaluate((slot) => {
    const result = window.steampunkDebug!.ui.getPauseMenuModel()
    const row = result.ok ? result.model?.slots.find((each) => each.slot === slot) : undefined
    return row?.scrapConfirm?.question ?? null
  }, SLOT)
}

function scrapDeletedLines(page: Page): Promise<unknown[]> {
  return page.evaluate(() =>
    window.steampunkRunLog!()
      .split('\n')
      .filter((text) => text.includes('"event":"save_deleted"'))
      .map((text) => JSON.parse(text).data),
  )
}

/** Opens the save page from driving and saves the long name into the first (empty) slot. */
async function saveIntoFirstSlot(page: Page): Promise<void> {
  await tap(page, 'open_pause_menu')
  await tap(page, 'ui_down')
  await tap(page, 'ui_confirm')
  await waitForSlotList(page)
  await page.evaluate((name) => window.steampunkDebug!.ui.setPauseSaveName(name), SAVE_NAME)
  await tap(page, 'ui_confirm')
  await waitForSlotListed(page, SLOT, true)
}

/** The question sits inside the viewport: a long name wraps rather than running off the side. */
async function expectQuestionOnScreen(page: Page, width: number): Promise<void> {
  const box = await page.getByTestId(`pause-${SLOT}-scrap-question`).boundingBox()
  expect(box).not.toBeNull()
  expect(box!.x).toBeGreaterThanOrEqual(0)
  expect(box!.x + box!.width).toBeLessThanOrEqual(width)
}

for (const viewport of VIEWPORTS) {
  test.describe(`pause menu scrap at ${viewport.width}x${viewport.height} (ticket 704)`, () => {
    test.use({ viewport })

    test('Keep leaves the slot intact and the second Scrap removes it', async ({ page }) => {
      test.setTimeout(180_000)
      const errors = collectErrors(page)
      await openDebugGame(page)
      await page.evaluate(() => window.steampunkDebug!.fastForward(300))
      await saveIntoFirstSlot(page)

      // Focus is on the slot's Overwrite; its Scrap is next in reading order.
      await tap(page, 'ui_down')
      await expect(page.getByTestId(`pause-${SLOT}-scrap`)).toHaveAttribute('data-focused', 'true')
      await tap(page, 'ui_confirm')
      expect(await scrapQuestion(page)).toBe(`Scrap ${SAVE_NAME}? This can't be undone.`)
      await expect(page.getByTestId(`pause-${SLOT}-keep`)).toHaveAttribute('data-focused', 'true')
      await expectQuestionOnScreen(page, viewport.width)

      // Keep: the question goes, the slot stays listed, focus returns to Scrap.
      await tap(page, 'ui_confirm')
      expect(await scrapQuestion(page)).toBeNull()
      await waitForSlotListed(page, SLOT, true)
      await expect(page.getByTestId(`pause-${SLOT}-scrap`)).toHaveAttribute('data-focused', 'true')
      expect(await scrapDeletedLines(page)).toEqual([])

      // Scrap twice: the slot leaves the index and the row reads empty.
      await tap(page, 'ui_confirm')
      await tap(page, 'ui_up')
      await expect(page.getByTestId(`pause-${SLOT}-scrap-confirm`)).toHaveAttribute(
        'data-focused',
        'true',
      )
      await tap(page, 'ui_confirm')
      await waitForSlotListed(page, SLOT, false)
      await page.waitForFunction((slot) => {
        const result = window.steampunkDebug!.ui.getPauseMenuModel()
        return result.ok && result.model?.slots.find((row) => row.slot === slot)?.isEmpty === true
      }, SLOT)
      expect(await scrapDeletedLines(page)).toEqual([{ slot: SLOT }])
      expect(errors).toEqual([])
    })
  })
}
