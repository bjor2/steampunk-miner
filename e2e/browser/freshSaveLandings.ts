/**
 * What a fresh save finds on landing on each of P1 to P5 (ticket 656, the GD's end check on spec
 * #647), shared by the desktop run `freshSavePlanets.spec.ts` and the Pixel 7 run
 * `mobile/freshSavePlanets.spec.ts` (ticket 905): the planet's pool id, its hazard with a pocket of
 * it round the dock, and the planet card's line on arrival, all read on a session that is still a
 * play run, so a planet whose travel needs a debug command fails. Asserted through
 * `steampunkDebug`, never pixels.
 */
import { expect, type Page } from '@playwright/test'
import type { DebugApi } from '../../src/debug/debugApi'

declare global {
  interface Window {
    steampunkDebug?: DebugApi
  }
}

interface PlanetRowReading {
  ok: true
  planet: number
  pool: string | null
  hazard: { kind: string; tag: string } | null
  pocketKindsNearDock: string[]
}

export interface ExpectedLanding {
  planet: number
  pool: string
  hazard: { kind: string; tag: string } | null
  /** The planet card's one line on arrival; null for no card. */
  arrivalLine: string | null
}

/** Each planet's registry row (tickets 542, 651) and the card line ticket 654 shows for it. */
export const LANDINGS: readonly ExpectedLanding[] = [
  { planet: 1, pool: 'legacy', hazard: null, arrivalLine: null },
  {
    planet: 2,
    pool: 'foothold-p2',
    hazard: { kind: 'rockfall', tag: 'Rockfall' },
    arrivalLine: 'Rockfall. Loose scree pours into the cut; mind what hangs above.',
  },
  {
    planet: 3,
    pool: 'foothold-p3',
    hazard: { kind: 'firedamp', tag: 'Firedamp' },
    arrivalLine: 'Firedamp. Sealed gas chokes the boiler when breached; back out.',
  },
  {
    planet: 4,
    pool: 'foothold-p4',
    hazard: { kind: 'spinecrystal', tag: 'Spinecrystal' },
    arrivalLine: 'Spinecrystal. Brittle clusters shatter and score the hull.',
  },
  {
    planet: 5,
    pool: 'foothold-p5',
    hazard: { kind: 'steamvent', tag: 'Steam vents' },
    arrivalLine: 'Steam vents. A cut vent blasts up the shaft; stand clear of it.',
  },
]

/**
 * The bot's time on each planet is up to two hours of play (`ARRIVAL_TICKS_PER_PLANET`), played
 * headlessly twice (once by the bot, once replayed): a few minutes a planet on the box.
 */
export const MS_PER_PLANET = 5 * 60_000
/** The travel card (up to 10 s, decision #10) goes first; the planet card shows 8 s after it. */
const CARD_WAIT_MS = 30_000

/** A fresh context holds no save, so `?debug` starts a new game on planet 1 straight into play. */
export async function openFreshSave(page: Page): Promise<string[]> {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(String(error)))
  await page.goto('/?debug')
  await page.waitForFunction(() => window.steampunkDebug !== undefined)
  return errors
}

export const isDebugRun = (page: Page) =>
  page.evaluate(() => {
    const read = window.steampunkDebug!.ui.getHudModel()
    return read.ok ? read.model.isDebugRun : null
  })

/** The pacing bot played to `planet` and replayed on the live game (`bot.playToPlanet`). */
export const playBotToPlanet = (page: Page, planet: number) =>
  page.evaluate((index) => window.steampunkDebug!.bot.playToPlanet(index), planet)

/** On `landing`'s planet as play: its pool, its hazard with a pocket round the dock, its card. */
export async function expectLandedOn(page: Page, landing: ExpectedLanding): Promise<void> {
  expect(await isDebugRun(page)).toBe(false)
  const row = await planetRowOf(page)
  expect(row).toMatchObject({
    planet: landing.planet,
    pool: landing.pool,
    hazard: landing.hazard,
  })
  expect(row.pocketKindsNearDock).toEqual(landing.hazard === null ? [] : [landing.hazard.kind])
  await expectLandedCard(page, landing)
}

const planetRowOf = (page: Page) =>
  page.evaluate(
    () => window.steampunkDebug!.features.ores.getPlanetRow() as unknown as PlanetRowReading,
  )

/** The arrival lines of the planet card once it shows for `planet`. */
async function shownCardLinesOn(page: Page, planet: number): Promise<string[]> {
  const handle = await page.waitForFunction(
    (index) => {
      const read = window.steampunkDebug!.ui.getPlanetCard()
      const card = read.ok ? read.card : null
      return card?.planetIndex === index ? card.lines.map((line) => line.arrivalLine) : null
    },
    planet,
    { timeout: CARD_WAIT_MS },
  )
  return (await handle.jsonValue()) as string[]
}

const shownCardNow = (page: Page) =>
  page.evaluate(() => {
    const read = window.steampunkDebug!.ui.getPlanetCard()
    return read.ok ? read.card : null
  })

async function expectLandedCard(page: Page, landing: ExpectedLanding): Promise<void> {
  if (landing.arrivalLine === null) {
    expect(await shownCardNow(page)).toBeNull()
    return
  }
  expect(await shownCardLinesOn(page, landing.planet)).toEqual([landing.arrivalLine])
}
