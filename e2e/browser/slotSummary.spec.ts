/**
 * The save slot line's summary (ticket 703), on the preview build at 360x640 and 1280x800: a
 * pause-menu save lists its planet name, depth with the mini core gauge and money (at most 6
 * characters) on the Save page and, after a reload to the title, on the Load list. Every fact sits
 * inside its row and the viewport (a phone wraps the facts; none runs off the side), and on the
 * desktop the planet, depth with gauge and money share one line. Driven through
 * `window.steampunkDebug` and the menu keys only; asserts state and boxes, never pixels.
 */
import { expect, test, type Locator, type Page } from '@playwright/test'
import type { DebugApi } from '../../src/debug/debugApi'

declare global {
  interface Window {
    steampunkDebug?: DebugApi
  }
}

/** The longest name the save field takes (`SAVE_NAME_MAX_CHARS`). */
const SAVE_NAME = 'Summary line at its widest, go on now ok'
/** A balance whose short text takes all 6 characters the formatter allows. */
const MONEY = '987654321987654'
const SLOT = 'slot-1'
const MONEY_CHARS_MAX = 6
const VIEWPORTS = [
  { width: 360, height: 640 },
  { width: 1280, height: 800 },
]
const DESKTOP_WIDTH = 1280

function collectErrors(page: Page): string[] {
  const errors: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })
  page.on('pageerror', (error) => errors.push(String(error)))
  return errors
}

async function openDebugGame(page: Page, query: string): Promise<void> {
  await page.goto(`/?${query}`)
  await page.waitForFunction(() => window.steampunkDebug !== undefined, null, { timeout: 60_000 })
}

function tap(page: Page, actionId: string): Promise<void> {
  return page.evaluate((action) => {
    const result = window.steampunkDebug!.input.tap(action)
    if (!result.ok) throw new Error(result.problems.join('; '))
  }, actionId)
}

/** Saves the long name into the first (empty) slot from the pause menu's Save page. */
async function saveIntoFirstSlot(page: Page): Promise<void> {
  await tap(page, 'open_pause_menu')
  await tap(page, 'ui_down')
  await tap(page, 'ui_confirm')
  await page.waitForFunction(() => {
    const result = window.steampunkDebug!.ui.getPauseMenuModel()
    return result.ok && result.model?.slots[0].title !== 'Reading saves…'
  })
  await page.evaluate((name) => window.steampunkDebug!.ui.setPauseSaveName(name), SAVE_NAME)
  await tap(page, 'ui_confirm')
  await page.waitForFunction(async (slot) => {
    const result = await window.steampunkDebug!.saves.list()
    return result.ok && result.entries.some((entry) => entry.slot === slot && entry.summary)
  }, SLOT)
}

function pauseRowSummary(page: Page) {
  return page.evaluate((slot) => {
    const result = window.steampunkDebug!.ui.getPauseMenuModel()
    return result.ok ? result.model?.slots.find((row) => row.slot === slot)?.summary : null
  }, SLOT)
}

function titleRowSummary(page: Page) {
  return page.evaluate((slot) => {
    const result = window.steampunkDebug!.ui.getTitleMenuModel()
    const row = result.ok ? result.model?.slotRows.find((each) => each.slot === slot) : undefined
    return row === undefined
      ? null
      : { planetText: row.planetText, depth: row.depth, money: row.money }
  }, SLOT)
}

/** Each fact of the row lies inside the row and the viewport; the gauge shows beside the depth. */
async function expectSummaryFits(row: Locator, width: number): Promise<void> {
  const rowBox = await row.boundingBox()
  expect(rowBox).not.toBeNull()
  expect(rowBox!.x).toBeGreaterThanOrEqual(0)
  expect(rowBox!.x + rowBox!.width).toBeLessThanOrEqual(width)
  const gauge = row.getByRole('meter')
  await expect(gauge).toBeVisible()
  const facts = await row.locator('p > span').all()
  for (const fact of facts) {
    const box = await fact.boundingBox()
    expect(box!.x).toBeGreaterThanOrEqual(rowBox!.x)
    expect(box!.x + box!.width).toBeLessThanOrEqual(rowBox!.x + rowBox!.width + 0.5)
  }
  if (width >= DESKTOP_WIDTH) await expectSummaryOnOneLine(facts.slice(0, 3))
}

/** Planet, depth with gauge and money: the same line on a desktop. */
async function expectSummaryOnOneLine(facts: readonly Locator[]): Promise<void> {
  const tops = await Promise.all(facts.map(async (fact) => (await fact.boundingBox())!.y))
  expect(Math.max(...tops) - Math.min(...tops)).toBeLessThan(4)
}

for (const viewport of VIEWPORTS) {
  test.describe(`save slot summary at ${viewport.width}x${viewport.height} (ticket 703)`, () => {
    test.use({ viewport })

    test('the Save page and the Load list show planet, depth with gauge and money', async ({
      page,
    }) => {
      test.setTimeout(180_000)
      const errors = collectErrors(page)
      await openDebugGame(page, 'debug')
      await page.waitForFunction(() => window.steampunkDebug!.getPhysicsStats().ok)
      await page.evaluate((amount) => window.steampunkDebug!.giveMoney(amount), MONEY)
      await page.evaluate(() => window.steampunkDebug!.fastForward(300))
      await saveIntoFirstSlot(page)

      const saved = await pauseRowSummary(page)
      expect(saved?.money.text.length).toBeLessThanOrEqual(MONEY_CHARS_MAX)
      expect(saved?.money.text).not.toBe('unknown')
      expect(saved?.depth.gaugePermille).not.toBeNull()
      await expectSummaryFits(page.getByTestId(`pause-${SLOT}`), viewport.width)

      await openDebugGame(page, 'debug&title')
      await tap(page, 'ui_down')
      await tap(page, 'ui_down')
      await tap(page, 'ui_confirm')
      await page.waitForFunction(() => {
        const result = window.steampunkDebug!.ui.getTitleMenuModel()
        return result.ok && result.model?.page === 'load'
      })
      expect(await titleRowSummary(page)).toEqual(saved)
      await expectSummaryFits(page.getByTestId(`title-slot-${SLOT}`), viewport.width)
      expect(errors).toEqual([])
    })
  })
}
