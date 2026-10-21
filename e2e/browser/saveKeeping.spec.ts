/**
 * Save keeping (#470 P1-8, ticket 479), on the preview build: a committed old save imported in
 * place of a picked file resumes through the migration chain; Export hands the session's last save
 * over as a download holding exactly the text the debug API reads; and that text imported in a
 * fresh browser context (another device: empty localStorage and IndexedDB) resumes at the same
 * digest and exports byte-identical text again. The same spec runs on every browser project, so
 * once the harness ticket (#481) adds WebKit it proves the engines agree. Driven through
 * `window.steampunkDebug` only; asserts state and digests, never pixels. A file picker opens only
 * from a real tap, so the picker itself stays a hand check. Ticket 671 adds the NDJSON lines the
 * import, the load, the autosave write and the export log, payload and order, and imports the
 * pre-175 planet-1 save: the planet-10 one seats only a scripted `p1`, which the store, playing as
 * `player_1`, refuses.
 */
import { readFile } from 'node:fs/promises'
import { expect, test, type Page } from '@playwright/test'
import type { DebugApi } from '../../src/debug/debugApi'
import PLANET_1_SAVE from '../../src/systems/save/fixtures/pre-175-planet-1.save.json'

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

/** The run log's save and load lines, in the order they were written. */
interface SaveLine {
  event: string
  data: Record<string, unknown>
}

const SAVE_EVENTS = [
  'save_imported',
  'save_migrated',
  'checkpoint_loaded',
  'checkpoint_saved',
  'save_exported',
]

async function saveLinesOf(page: Page): Promise<SaveLine[]> {
  const text = await page.evaluate(() => window.steampunkRunLog!())
  return text
    .split('\n')
    .filter((line) => line.trim() !== '')
    .map((line) => JSON.parse(line) as SaveLine)
    .filter((line) => SAVE_EVENTS.includes(line.event))
    .map(({ event, data }) => ({ event, data }))
}

/** What an imported old save logs: the file, the migration steps, the load, the autosave write. */
function importedSaveLines(json: string, digest: string): unknown[] {
  const { saveEpoch } = JSON.parse(json) as { saveEpoch: number }
  const bytes = new TextEncoder().encode(json).length
  return [
    { event: 'save_imported', data: { epoch: saveEpoch, bytes, digest } },
    expect.objectContaining({ event: 'save_migrated' }),
    { event: 'checkpoint_loaded', data: { slot: 'autosave', epoch: saveEpoch, digest } },
    {
      event: 'checkpoint_saved',
      data: expect.objectContaining({ slot: 'autosave', epoch: saveEpoch, bytes, digest }),
    },
  ]
}

/** A run of `save_migrated` lines kept as its first: the chain's steps change with every bump. */
function withMigrationsFolded(lines: SaveLine[]): SaveLine[] {
  return lines.filter(
    (line, index) => line.event !== 'save_migrated' || lines[index - 1]?.event !== 'save_migrated',
  )
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
    await importText(page, JSON.stringify(PLANET_1_SAVE))
    await waitForLine(page, 'checkpoint_saved')
    const digest = await sessionDigest(page)
    const exported = await exportText(page)
    expect(exported).toBe(JSON.stringify(PLANET_1_SAVE))

    expect(withMigrationsFolded(await saveLinesOf(page))).toEqual(
      importedSaveLines(exported, digest),
    )

    const downloaded = await downloadExport(page)
    expect(downloaded).toEqual({ fileName: 'steampunk-miner-autosave.json', text: exported })
    await waitForLine(page, 'save_exported')
    expect((await saveLinesOf(page)).at(-1)).toEqual({
      event: 'save_exported',
      data: {
        slot: 'autosave',
        epoch: PLANET_1_SAVE.saveEpoch,
        bytes: new TextEncoder().encode(exported).length,
      },
    })

    const device = await browser.newContext()
    const fresh = await device.newPage()
    const freshErrors = collectErrors(fresh)
    await openDebugGame(fresh)
    await importText(fresh, downloaded.text)
    await waitForLine(fresh, 'checkpoint_saved')
    expect(await sessionDigest(fresh)).toBe(digest)
    expect(withMigrationsFolded(await saveLinesOf(fresh))).toEqual(
      importedSaveLines(downloaded.text, digest),
    )
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
