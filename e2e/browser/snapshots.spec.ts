/**
 * A `?debug` run's snapshots (#123), on the preview build: a planet change takes a screenshot and a
 * dock keeps a copy of the slot save, each logged where the comparison tool reads it, and
 * `exportSnapshots()` downloads them from IndexedDB as one uncompressed zip. Asserts the log lines,
 * the zip's layout and the files' signatures, never the pictures.
 */
import { expect, test, type Page } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import type { DebugApi } from '../../src/debug/debugApi'
import { runEventProblems } from '../../src/logging/runEventSchema'

declare global {
  interface Window {
    steampunkDebug?: DebugApi
    steampunkRunLog?: () => string
  }
}

interface LoggedLine {
  event: string
  runId: string
  tick: number
  data: Record<string, number | string>
}

/** Software GL draws a frame in a few hundred ms; the screenshot then waits on PNG encoding. */
const WAIT_FOR_LINE_MS = 30_000
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
const END_OF_CENTRAL_DIRECTORY_BYTES = 22

async function openDebugGame(page: Page): Promise<string[]> {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(String(error)))
  await page.goto('/?debug')
  await page.waitForFunction(() => window.steampunkDebug!.getPhysicsStats().ok, null, {
    timeout: 60_000,
  })
  return errors
}

function readRunLog(page: Page): Promise<LoggedLine[]> {
  return page.evaluate(() =>
    window.steampunkRunLog!()
      .split('\n')
      .filter((text) => text.length > 0)
      .map((text) => JSON.parse(text)),
  )
}

async function waitForLineWith(page: Page, fragment: string): Promise<LoggedLine> {
  await page.waitForFunction((text) => window.steampunkRunLog!().includes(text), fragment, {
    timeout: WAIT_FOR_LINE_MS,
    polling: 500,
  })
  const lines = await readRunLog(page)
  return lines.find((line) => JSON.stringify(line).includes(fragment))!
}

/** The entries and where each one's data starts, read from the zip's central directory. */
function readZipEntries(zip: Buffer): Map<string, Buffer> {
  const end = zip.length - END_OF_CENTRAL_DIRECTORY_BYTES
  expect(zip.readUInt32LE(end)).toBe(0x06054b50)
  const entries = new Map<string, Buffer>()
  let at = zip.readUInt32LE(end + 16)
  for (let index = 0; index < zip.readUInt16LE(end + 10); index++) {
    const nameLength = zip.readUInt16LE(at + 28)
    const local = zip.readUInt32LE(at + 42)
    const dataAt = local + 30 + zip.readUInt16LE(local + 26) + zip.readUInt16LE(local + 28)
    const name = zip.toString('utf8', at + 46, at + 46 + nameLength)
    entries.set(name, zip.subarray(dataAt, dataAt + zip.readUInt32LE(at + 20)))
    at += 46 + nameLength
  }
  return entries
}

test.describe('debug run snapshots (#123)', () => {
  test('screens a planet change, keeps the slot save and exports both as one zip', async ({
    page,
  }) => {
    test.setTimeout(120_000)
    const errors = await openDebugGame(page)

    await page.evaluate(() => window.steampunkDebug!.setPlanet(2))
    const shot = await waitForLineWith(page, '"trigger":"planet_change"')
    expect(shot.data).toMatchObject({
      kind: 'screenshot',
      file: `shots/${shot.tick}-planet_change.png`,
    })
    expect(shot.data.bytes).toBeGreaterThan(1000)

    await page.evaluate(() => window.steampunkDebug!.teleportToDock('sell'))
    const saved = await waitForLineWith(page, '"file":"snapshots/save-')
    expect(saved.event).toBe('checkpoint_saved')

    const download = page.waitForEvent('download')
    const exported = await page.evaluate(() => window.steampunkDebug!.exportSnapshots())
    const zip = await readFile(await (await download).path())
    expect(exported).toMatchObject({ ok: true, bytes: zip.length })

    const entries = readZipEntries(zip)
    const png = entries.get(`${shot.runId}/${shot.data.file}`)!
    expect([...png.subarray(0, 8)]).toEqual(PNG_SIGNATURE)
    expect(png.length).toBe(shot.data.bytes)
    const save = JSON.parse(entries.get(`${saved.runId}/${saved.data.file}`)!.toString('utf8'))
    expect(save).toMatchObject({ saveEpoch: saved.data.epoch, digest: saved.data.digest })

    expect((await readRunLog(page)).flatMap(runEventProblems)).toEqual([])
    expect(errors).toEqual([])
  })
})
