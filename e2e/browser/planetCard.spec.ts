/**
 * The kernel planet card (ticket 343, moved from #293's acceptance), on the preview build: a
 * magnetic planet (P25 and later) shows the "Magnetic" tag and the arrival line in the #159 ledger
 * voice; P30, the relic planet, shows no card. Asserted through `steampunkDebug.ui.getPlanetCard`,
 * never pixels; the session moves by the debug API as a scenario would, the vehicle stays docked.
 */
import { expect, test, type Page } from '@playwright/test'
import type { DebugApi } from '../../src/debug/debugApi'

declare global {
  interface Window {
    steampunkDebug?: DebugApi
  }
}

const MAGNETIC_LINE = 'Magnetic. Ferrous veins throw fields; the probe reads them.'

async function openDebugGame(page: Page): Promise<string[]> {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(String(error)))
  await page.goto('/?debug')
  await page.waitForFunction(() => window.steampunkDebug !== undefined)
  return errors
}

async function cardOn(page: Page, planet: number) {
  const moved = await page.evaluate((index) => window.steampunkDebug!.setPlanet(index).ok, planet)
  expect(moved).toBe(true)
  return page.evaluate(() => {
    const read = window.steampunkDebug!.ui.getPlanetCard()
    return read.ok ? read.card : null
  })
}

test('a magnetic planet shows the "Magnetic" tag and its arrival line on its planet card', async ({
  page,
}) => {
  const errors = await openDebugGame(page)
  for (const planet of [25, 28, 43]) {
    const card = await cardOn(page, planet)
    expect(card?.planetIndex).toBe(planet)
    expect(card?.lines.map(({ tag, arrivalLine }) => ({ tag, arrivalLine }))).toEqual([
      { tag: 'Magnetic', arrivalLine: MAGNETIC_LINE },
    ])
  }
  expect(errors).toEqual([])
})

test('the relic planet shows no planet card', async ({ page }) => {
  const errors = await openDebugGame(page)
  expect(await cardOn(page, 25)).not.toBeNull()
  expect(await cardOn(page, 30)).toBeNull()
  expect(errors).toEqual([])
})
