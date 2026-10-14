/**
 * The pause menu's manual save (#401 C, ticket 404), on the preview build: Escape's action opens
 * the menu and holds the fixed step, menu focus reaches Save game and the first empty slot, the
 * save lands in the slot index with its name, planet and playtime, and loading the slot back
 * gives the state digest the save was taken at. Driven through `window.steampunkDebug` only;
 * asserts state and digests, never pixels.
 */
import { expect, test, type Page } from '@playwright/test'
import type { DebugApi, SessionPoint } from '../../src/debug/debugApi'
import type { SaveSlotEntry } from '../../src/systems/save/saveSlotIndex'

declare global {
  interface Window {
    steampunkDebug?: DebugApi
    steampunkRunLog?: () => string
  }
}

const SAVE_NAME = 'E2E pause save'
/** Software GL draws a frame in a few hundred ms, so the held step gets several frames to slip. */
const HELD_STEP_WAIT_MS = 1_000

async function openDebugGame(page: Page): Promise<string[]> {
  const errors: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })
  page.on('pageerror', (error) => errors.push(String(error)))
  await page.goto('/?debug')
  await page.waitForFunction(() => window.steampunkDebug!.getPhysicsStats().ok, null, {
    timeout: 60_000,
  })
  return errors
}

function sessionPointNow(page: Page): Promise<SessionPoint> {
  return page.evaluate(() => {
    const result = window.steampunkDebug!.snapshot()
    if (!result.ok) throw new Error(result.problems.join('; '))
    return { tick: result.snapshot.tick, digest: result.snapshot.digest }
  })
}

function tap(page: Page, actionId: string): Promise<void> {
  return page.evaluate((action) => {
    const result = window.steampunkDebug!.input.tap(action)
    if (!result.ok) throw new Error(result.problems.join('; '))
  }, actionId)
}

function pauseMenuPage(page: Page): Promise<string | null> {
  return page.evaluate(() => {
    const result = window.steampunkDebug!.ui.getPauseMenuModel()
    return result.ok ? (result.model?.page ?? null) : null
  })
}

async function waitForSlotList(page: Page): Promise<void> {
  await page.waitForFunction(() => {
    const result = window.steampunkDebug!.ui.getPauseMenuModel()
    return result.ok && result.model?.slots[0].title !== 'Reading saves…'
  })
}

async function waitForSlotEntry(page: Page, slot: string): Promise<SaveSlotEntry> {
  const handle = await page.waitForFunction(async (key) => {
    const result = await window.steampunkDebug!.saves.list()
    return result.ok ? (result.entries.find((entry) => entry.slot === key) ?? false) : false
  }, slot)
  return (await handle.jsonValue()) as SaveSlotEntry
}

test.describe('pause menu save (ticket 404)', () => {
  test('pauses, saves into a new named slot, and loads it back to the identical digest', async ({
    page,
  }) => {
    const errors = await openDebugGame(page)
    await page.evaluate(() => window.steampunkDebug!.fastForward(600))

    await tap(page, 'open_pause_menu')
    expect(await pauseMenuPage(page)).toBe('main')
    const saved = await sessionPointNow(page)
    await page.waitForTimeout(HELD_STEP_WAIT_MS)
    expect(await sessionPointNow(page)).toEqual(saved)

    await tap(page, 'ui_down')
    await tap(page, 'ui_confirm')
    expect(await pauseMenuPage(page)).toBe('save')
    await waitForSlotList(page)
    await page.evaluate((name) => window.steampunkDebug!.ui.setPauseSaveName(name), SAVE_NAME)
    await tap(page, 'ui_confirm')

    const entry = await waitForSlotEntry(page, 'slot-1')
    expect(entry).toMatchObject({ name: SAVE_NAME, planetIndex: 1, playtimeTicks: saved.tick })

    await tap(page, 'ui_cancel')
    await tap(page, 'ui_cancel')
    expect(await pauseMenuPage(page)).toBeNull()
    await page.evaluate(() => window.steampunkDebug!.pause())
    await page.evaluate(() => window.steampunkDebug!.fastForward(600))
    expect((await sessionPointNow(page)).digest).not.toBe(saved.digest)

    const loaded = await page.evaluate(() => window.steampunkDebug!.saves.load('slot-1'))
    expect(loaded).toEqual({ ok: true, ...saved })
    expect(errors).toEqual([])
  })
})
