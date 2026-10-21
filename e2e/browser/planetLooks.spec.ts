/**
 * Planets 2 to 5 each show their own look (ticket 653, spec #647; the GD bar that a planet's look
 * shows within a minute of landing), on the preview build in a 360 px wide phone window: on a
 * fresh game moved to each planet, the kernel draws the row look's sky band, and the rock, horizon
 * and band of P2 to P5 differ pairwise; P1 draws no band and has no row look, as before. Asserted
 * through `steampunkDebug`, never pixels; each planet's docked view is attached as its 360 px
 * review shot for the Game Director.
 */
import { expect, test, type Page } from '@playwright/test'
import type { DebugApi } from '../../src/debug/debugApi'

declare global {
  interface Window {
    steampunkDebug?: DebugApi
  }
}

interface PlanetLookReading {
  planet: number
  look: {
    rockSurface: string
    rockDeep: string
    horizon: string
    skyBand: { colour: string }
  } | null
  drawnSkyBandColour: string | null
}

const PHONE = { width: 360, height: 780 }
const LOOK_PLANETS = [2, 3, 4, 5]

async function openGame(page: Page): Promise<string[]> {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(String(error)))
  await page.setViewportSize(PHONE)
  await page.goto('/?debug')
  await page.waitForFunction(() => window.steampunkDebug !== undefined)
  return errors
}

const planetLookOf = (page: Page) =>
  page.evaluate(
    () => window.steampunkDebug!.features.ores.getPlanetLook() as unknown as PlanetLookReading,
  )

/** Moves to the planet and waits until its look is the one drawn. */
async function showPlanet(page: Page, planet: number): Promise<PlanetLookReading> {
  const moved = await page.evaluate((index) => window.steampunkDebug!.setPlanet(index).ok, planet)
  expect(moved).toBe(true)
  await page.waitForFunction((index) => {
    const reading = window.steampunkDebug!.features.ores.getPlanetLook() as unknown as {
      planet: number
      look: { skyBand: { colour: string } } | null
      drawnSkyBandColour: string | null
    }
    const wantedBand = reading.look?.skyBand.colour ?? null
    return reading.planet === index && reading.drawnSkyBandColour === wantedBand
  }, planet)
  return planetLookOf(page)
}

async function attachReviewShot(page: Page, planet: number): Promise<void> {
  await test.info().attach(`planet ${planet} look, 360 px`, {
    body: await page.screenshot(),
    contentType: 'image/png',
  })
}

test('planets 2 to 5 draw their own sky band, rock and horizon, all different, and planet 1 none', async ({
  page,
}) => {
  test.setTimeout(180_000)
  const errors = await openGame(page)
  const planet1 = await showPlanet(page, 1)
  expect(planet1.look).toBeNull()
  expect(planet1.drawnSkyBandColour).toBeNull()
  await attachReviewShot(page, 1)
  const readings: PlanetLookReading[] = []
  for (const planet of LOOK_PLANETS) {
    const reading = await showPlanet(page, planet)
    expect(reading.look).not.toBeNull()
    expect(reading.drawnSkyBandColour).toBe(reading.look!.skyBand.colour)
    readings.push(reading)
    await attachReviewShot(page, planet)
  }
  for (const part of ['rockSurface', 'horizon'] as const) {
    expect(new Set(readings.map((reading) => reading.look![part])).size).toBe(LOOK_PLANETS.length)
  }
  const bands = readings.map((reading) => reading.drawnSkyBandColour)
  expect(new Set(bands).size).toBe(LOOK_PLANETS.length)
  expect(errors).toEqual([])
})
