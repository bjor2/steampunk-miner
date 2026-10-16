/**
 * Save keeping (#470 P1-8, ticket 479), on the preview build: a committed old save imported in
 * place of a picked file resumes through the migration chain; Export hands the session's last save
 * over as a download holding exactly the text the debug API reads; and that text imported in a
 * fresh browser context (another device: empty localStorage and IndexedDB) resumes at the same
 * digest and exports byte-identical text again. The same spec runs on every browser project, so
 * once the harness ticket (#481) adds WebKit it proves the engines agree. Driven through
 * `window.steampunkDebug` only; asserts state and digests, never pixels. A file picker opens only
 * from a real tap, so the picker itself stays a hand check.
 */
import { readFile } from 'node:fs/promises'
import { expect, test, type Page } from '@playwright/test'
import type { DebugApi } from '../../src/debug/debugApi'
import PLANET_10_SAVE from '../../src/systems/save/fixtures/pre-175-planet-10.save.json'

declare global {
  interface Window {
    steampunkDebug?: DebugApi
    steampunkRunLog?: () => string
  }
}

const WAIT_FOR_LINE_MS = 30_000

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

async function waitForLine(page: Page, event: string): Promise<void> {
  await page.waitForFunction(
    (text) => window.steampunkRunLog!().includes(text),
    `"event":"${event}"`,
    {
      timeout: WAIT_FOR_LINE_MS,
      polling: 250,
    },
  )
}

function sessionDigest(page: Page): Promise<string> {
  return page.evaluate(() => {
    const result = window.steampunkDebug!.snapshot()
    if (!result.ok) throw new Error(result.problems.join('; '))
    return result.snapshot.digest
  })
}

function importText(page: Page, json: string): Promise<void> {
  return page.evaluate((text) => {
    const result = window.steampunkDebug!.saves.importText(text)
    if (!result.ok) throw new Error(result.problems.join('; '))
  }, json)
}

function exportText(page: Page): Promise<string> {
  return page.evaluate(() => {
    const result = window.steampunkDebug!.saves.exportText()
    if (!result.ok) throw new Error(result.problems.join('; '))
    return result.json
  })
}

function savedLineCount(page: Page): Promise<number> {
  return page.evaluate(
    () => window.steampunkRunLog!().split('"event":"checkpoint_saved"').length - 1,
  )
}

/** Presses Export and reads the downloaded file back as text. */
async function downloadExport(page: Page): Promise<{ fileName: string; text: string }> {
  const download = page.waitForEvent('download')
  await page.evaluate(() => {
    const result = window.steampunkDebug!.saves.exportFile()
    if (!result.ok) throw new Error(result.problems.join('; '))
  })
  const file = await download
  return { fileName: file.suggestedFilename(), text: await readFile(await file.path(), 'utf8') }
}

test.describe('save keeping (ticket 479)', () => {
  test('imports an old save, exports it, and the export resumes byte for byte in a fresh context', async ({
    browser,
    page,
  }) => {
    test.setTimeout(240_000)
    const errors = collectErrors(page)
    await openDebugGame(page)
    await importText(page, JSON.stringify(PLANET_10_SAVE))
    await waitForLine(page, 'checkpoint_saved')
    const digest = await sessionDigest(page)
    const exported = await exportText(page)
    expect(exported).toBe(JSON.stringify(PLANET_10_SAVE))

    const downloaded = await downloadExport(page)
    expect(downloaded).toEqual({ fileName: 'steampunk-miner-autosave.json', text: exported })
    await waitForLine(page, 'save_exported')

    const device = await browser.newContext()
    const fresh = await device.newPage()
    const freshErrors = collectErrors(fresh)
    await openDebugGame(fresh)
    await importText(fresh, downloaded.text)
    await waitForLine(fresh, 'checkpoint_loaded')
    expect(await sessionDigest(fresh)).toBe(digest)
    expect(await exportText(fresh)).toBe(exported)
    await device.close()
    expect([...errors, ...freshErrors]).toEqual([])
  })

  test('writes a docked session into the autosave once more as the page hides', async ({
    page,
  }) => {
    test.setTimeout(180_000)
    await openDebugGame(page)
    await page.evaluate(() => window.steampunkDebug!.teleportToDock('sell'))
    await waitForLine(page, 'checkpoint_saved')
    const before = await savedLineCount(page)
    await page.evaluate(() => window.dispatchEvent(new Event('pagehide')))
    await page.waitForFunction(
      (count) => window.steampunkRunLog!().split('"event":"checkpoint_saved"').length - 1 > count,
      before,
      { timeout: WAIT_FOR_LINE_MS, polling: 250 },
    )
    const saved = JSON.parse(await exportText(page))
    expect(saved.profile.players.player_1.vehicle.mode).toBe('docked')
  })
})
