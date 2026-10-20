/**
 * The material pop A/B switch (ticket 614, #442), on the preview build: a session starts on A, or
 * on the mode `?pop=` asks; the debug flag panel and `ui.setMaterialPopMode` switch it live; every
 * start and switch is a `material_pop_mode_set` line; nothing is remembered across a reload, and
 * a switch sends no command. The panel opens with a click on the version label in a `?debug`
 * session (ticket 549). Asserted on the debug API's reads and the run's lines, never pixels.
 */
import { expect, test, type Page } from '@playwright/test'
import type { DebugApi } from '../../src/debug/debugApi'

declare global {
  interface Window {
    steampunkDebug?: DebugApi
    steampunkRunLog?: () => string
    steampunkRunCommands?: () => string
  }
}

async function launch(page: Page, query: string): Promise<void> {
  await page.goto(`/?${query}`)
  await page.waitForFunction(() => window.steampunkDebug !== undefined, null, { timeout: 60_000 })
}

function readMode(page: Page) {
  return page.evaluate(() => {
    const read = window.steampunkDebug!.ui.getMaterialPopMode()
    if (!read.ok) throw new Error(read.problems.join('; '))
    return read.mode
  })
}

function readPopLines(page: Page) {
  return page.evaluate(() =>
    window.steampunkRunLog!()
      .split('\n')
      .filter((text) => text.includes('"material_pop_mode_set"'))
      .map((text) => JSON.parse(text).data),
  )
}

function readCommandCount(page: Page) {
  return page.evaluate(() => window.steampunkRunCommands!().split('\n').filter(Boolean).length)
}

test('material pop: A by default, B from the URL, switched on the panel, logged, per session', async ({
  page,
}) => {
  test.setTimeout(240_000)
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(String(error)))

  await launch(page, 'debug')
  expect(await readMode(page)).toBe('A')
  expect(await readPopLines(page)).toEqual([{ mode: 'A', source: 'default' }])

  await launch(page, 'debug&pop=B')
  expect(await readMode(page)).toBe('B')
  expect(await readPopLines(page)).toEqual([{ mode: 'B', source: 'url' }])

  await launch(page, 'debug')
  expect(await readMode(page)).toBe('A')

  const commandsBefore = await readCommandCount(page)
  await page.getByTestId('version-label').click({ timeout: 120_000 })
  await page.getByTestId('material-pop-choice-B').click()
  await expect(page.getByTestId('material-pop-choice-B')).toHaveAttribute('aria-checked', 'true')
  expect(await readMode(page)).toBe('B')
  expect(await page.evaluate(() => window.steampunkDebug!.ui.setMaterialPopMode('A'))).toEqual({
    ok: true,
  })
  await expect(page.getByTestId('material-pop-choice-A')).toHaveAttribute('aria-checked', 'true')
  expect(await readPopLines(page)).toEqual([
    { mode: 'A', source: 'default' },
    { mode: 'B', source: 'panel' },
    { mode: 'A', source: 'debugApi' },
  ])
  expect(await readCommandCount(page)).toBe(commandsBefore)
  expect(errors).toEqual([])
})
