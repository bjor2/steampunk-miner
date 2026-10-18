/**
 * The client dev flag store and the browser's override (ticket 548), on the preview build:
 * `ui.setDevFlags` sets flags through the logged command path without touching `localStorage`; an
 * override the browser remembers is applied at the next `?debug` session's first tick as one
 * `debug.setFlags`; `?noflags` forgets it and boots on the shipped flags. A player's launch never
 * reads the override (it has no debug handle to read with; `src/shell/devFlagStorage.test.ts`
 * holds that rule). Asserted on the debug API's reads and the command log, never pixels.
 */
import { expect, test, type Page } from '@playwright/test'
import type { DebugApi } from '../../src/debug/debugApi'

declare global {
  interface Window {
    steampunkDebug?: DebugApi
    steampunkRunCommands?: () => string
  }
}

const OVERRIDES_KEY = 'sm.devFlagOverrides.v1'

async function launch(page: Page, query: string): Promise<void> {
  await page.goto(`/?${query}`)
  await page.waitForFunction(() => window.steampunkDebug !== undefined, null, { timeout: 60_000 })
}

function readDevFlags(page: Page) {
  return page.evaluate(() => {
    const read = window.steampunkDebug!.ui.getDevFlags()
    if (!read.ok) throw new Error(read.problems.join('; '))
    return read.flags
  })
}

function readSetFlagsCommands(page: Page) {
  return page.evaluate(() =>
    window.steampunkRunCommands!()
      .split('\n')
      .filter((text) => text.includes('debug.setFlags'))
      .map((text) => JSON.parse(text)),
  )
}

function readStoredOverrides(page: Page) {
  return page.evaluate((key) => window.localStorage.getItem(key), OVERRIDES_KEY)
}

test('dev flags: set live, remembered override applied at session start, ?noflags clears it', async ({
  page,
}) => {
  test.setTimeout(240_000)
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(String(error)))
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })

  await launch(page, 'debug')
  const fresh = await readDevFlags(page)
  expect(fresh.overrides).toEqual({})
  expect(fresh.isEverSet).toBe(false)
  expect(Object.values(fresh.authority).every((isOn) => isOn)).toBe(true)
  expect(await readSetFlagsCommands(page)).toEqual([])

  const set = await page.evaluate(() =>
    window.steampunkDebug!.ui.setDevFlags({ 'drill.exactCarry': false }),
  )
  expect(set).toEqual({ ok: true })
  expect((await readDevFlags(page)).authority['drill.exactCarry']).toBe(false)
  expect(await readSetFlagsCommands(page)).toHaveLength(1)
  expect(await readStoredOverrides(page)).toBeNull()

  await page.evaluate(
    ([key, text]) => window.localStorage.setItem(key, text),
    [OVERRIDES_KEY, JSON.stringify({ 'heat.workUncapped': { isOn: false, defaultWhenSet: true } })],
  )
  await launch(page, 'debug')
  // The remembered override goes out at the session's first tick, whatever world resumed.
  const remembered = await readDevFlags(page)
  expect(remembered.overrides).toEqual({
    'heat.workUncapped': { isOn: false, defaultWhenSet: true },
  })
  expect(remembered.authority['heat.workUncapped']).toBe(false)
  expect(remembered.isEverSet).toBe(true)
  const [sent] = await readSetFlagsCommands(page)
  expect(sent.payload).toEqual({ delta: { 'heat.workUncapped': false } })

  // The page hide may have written the debug autosave, which keeps the flags its world ran with
  // (the HS (e) load rule); ?noflags forgets the browser's override, so nothing is sent on top.
  await launch(page, 'debug&noflags')
  expect(await readStoredOverrides(page)).toBeNull()
  const cleared = await readDevFlags(page)
  expect(cleared.overrides).toEqual({})
  expect(cleared.client.flags).toEqual(fresh.client.flags)
  expect(await readSetFlagsCommands(page)).toEqual([])

  expect(errors).toEqual([])
})
