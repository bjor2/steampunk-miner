/**
 * The kernel planet card (ticket 343, moved from #293's acceptance), on the preview build: a
 * magnetic planet (P25 and later) shows the "Magnetic" tag and the arrival line in the #159 ledger
 * voice; P30, the relic planet, shows no card; planets 2 to 5 each read their own hazard line
 * (ticket 654), and it stays inside the card in a 360 px window. Asserted through `steampunkDebug.ui.getPlanetCard`,
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
/** Ticket 651's copy on each planet's registry row, shown by ticket 654. */
const HAZARD_LINES = [
  {
    tag: 'Rockfall',
    arrivalLine: 'Rockfall. Loose scree pours into the cut; mind what hangs above.',
  },
  {
    tag: 'Firedamp',
    arrivalLine: 'Firedamp. Sealed gas chokes the boiler when breached; back out.',
  },
  {
    tag: 'Spinecrystal',
    arrivalLine: 'Spinecrystal. Brittle clusters shatter and score the hull.',
  },
  {
    tag: 'Steam vents',
    arrivalLine: 'Steam vents. A cut vent blasts up the shaft; stand clear of it.',
  },
]
const NARROW_VIEWPORT = { width: 360, height: 740 }

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

test('planets 2 to 5 each show their own hazard line on the planet card', async ({ page }) => {
  const errors = await openDebugGame(page)
  for (const [offset, line] of HAZARD_LINES.entries()) {
    const planet = 2 + offset
    const card = await cardOn(page, planet)
    expect(card?.planetIndex).toBe(planet)
    expect(card?.lines.map(({ tag, arrivalLine }) => ({ tag, arrivalLine }))).toEqual([line])
  }
  expect(errors).toEqual([])
})

test('each hazard line stays inside the planet card in a 360 px window', async ({ page }) => {
  await page.setViewportSize(NARROW_VIEWPORT)
  const errors = await openDebugGame(page)
  for (const [offset, line] of HAZARD_LINES.entries()) {
    await cardOn(page, 2 + offset)
    const card = page.getByTestId('planet-card')
    await expect(card).toContainText(line.arrivalLine)
    expect(await overflowsSideways(page)).toBe(false)
  }
  expect(errors).toEqual([])
})

/** Whether the card is wider than the window or any of its texts runs out of it sideways. */
function overflowsSideways(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const card = document.querySelector('[data-testid="planet-card"]')!
    const box = card.getBoundingClientRect()
    const isTextOutside = [...card.querySelectorAll('span, p')].some((text) => {
      const textBox = text.getBoundingClientRect()
      return textBox.left < box.left - 1 || textBox.right > box.right + 1
    })
    return box.left < 0 || box.right > window.innerWidth + 1 || isTextOutside
  })
}
