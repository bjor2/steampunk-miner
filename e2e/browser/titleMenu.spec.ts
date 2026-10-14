/**
 * The title menu (ticket 403, #401 B), on the preview build: `?debug&title` opens it on a fresh
 * save folder with Continue disabled; New Game starts play, a dock writes the autosave, and after
 * a reload to the title Continue restores the session with the same state hash the save logged.
 * Driven by `steampunkDebug` (the menu's model, action taps) and asserted on state and run-log
 * digests, never pixels.
 */
import { expect, test, type Page } from '@playwright/test'
import type { DebugApi } from '../../src/debug/debugApi'

declare global {
  interface Window {
    steampunkDebug?: DebugApi
    steampunkRunLog?: () => string
  }
}

interface LoggedLine {
  event: string
  data: Record<string, number | string>
}

const WAIT_FOR_LINE_MS = 30_000

async function openTitle(page: Page): Promise<void> {
  await page.goto('/?debug&title')
  await page.waitForFunction(() => window.steampunkDebug !== undefined, null, { timeout: 60_000 })
}

function readTitleMenu(page: Page) {
  return page.evaluate(() => {
    const read = window.steampunkDebug!.ui.getTitleMenuModel()
    return read.ok ? read.model : null
  })
}

async function tapConfirm(page: Page): Promise<void> {
  const tapped = await page.evaluate(() => window.steampunkDebug!.input.tap('ui_confirm').ok)
  expect(tapped).toBe(true)
}

async function waitForLine(page: Page, event: string): Promise<LoggedLine> {
  const fragment = `"event":"${event}"`
  await page.waitForFunction((text) => window.steampunkRunLog!().includes(text), fragment, {
    timeout: WAIT_FOR_LINE_MS,
    polling: 250,
  })
  const lines = await page.evaluate(() =>
    window.steampunkRunLog!()
      .split('\n')
      .filter((text) => text.length > 0)
      .map((text) => JSON.parse(text)),
  )
  return (lines as LoggedLine[]).find((line) => line.event === event)!
}

test('new game, save, title, continue restores the same state hash', async ({ page }) => {
  test.setTimeout(180_000)
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(String(error)))
  await openTitle(page)

  const fresh = await readTitleMenu(page)
  expect(fresh?.page).toBe('main')
  expect(fresh?.continueGame.reason).toBe('no_save')
  expect(fresh?.startFocus).toBe('title-new-game')
  await tapConfirm(page)
  await waitForLine(page, 'new_game_started')
  expect(await readTitleMenu(page)).toBeNull()

  const docked = await page.evaluate(() => window.steampunkDebug!.teleportToDock('sell').ok)
  expect(docked).toBe(true)
  const saved = await waitForLine(page, 'checkpoint_saved')
  expect(saved.data.slot).toBe('autosave')

  await openTitle(page)
  const withSave = await readTitleMenu(page)
  expect(withSave?.continueGame.reason).toBeNull()
  expect(withSave?.startFocus).toBe('title-continue')
  expect(withSave?.slotRows.map(({ slot, planetText }) => ({ slot, planetText }))).toEqual([
    { slot: 'autosave', planetText: 'Planet 1' },
  ])
  await tapConfirm(page)
  const loaded = await waitForLine(page, 'checkpoint_loaded')
  expect(loaded.data).toEqual({
    slot: 'autosave',
    epoch: saved.data.epoch,
    digest: saved.data.digest,
  })
  expect(await readTitleMenu(page)).toBeNull()
  expect(errors).toEqual([])
})
