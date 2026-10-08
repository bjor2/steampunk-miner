/**
 * The magnetic planet shows itself (#293, for the GD lock on spec #258 "On screen"), on the
 * preview build: on P28, whose veins lie by the dock on a new game's seed, the kernel's planet sky
 * band draws the aurora from its Blender ribbon and the planet-mix layer draws faint field lines
 * round those veins, within its 63 arcs; on P30, the relic planet, neither shows. The planet
 * card's tag and arrival line are #343's. Asserted through `steampunkDebug`, never pixels; the
 * vehicle stays docked.
 */
import { expect, test, type Page } from '@playwright/test'
import type { DebugApi } from '../../src/debug/debugApi'

declare global {
  interface Window {
    steampunkDebug?: DebugApi
  }
}

interface MagneticLooks {
  skyBand: { colour: string; isRibbonDrawn: boolean } | null
  fieldLines: { arcs: number; picks: number } | null
}

const MAGNETIC_PLANET = 28
const RELIC_PLANET = 30
const FIELD_ARC_CAP = 63

async function openGameOn(page: Page, planet: number): Promise<string[]> {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(String(error)))
  await page.goto('/?debug')
  await page.waitForFunction(() => window.steampunkDebug !== undefined)
  const moved = await page.evaluate((index) => window.steampunkDebug!.setPlanet(index).ok, planet)
  expect(moved).toBe(true)
  return errors
}

const magneticLooks = (page: Page) =>
  page.evaluate(
    () =>
      window.steampunkDebug!.features['planet-mix'].getMagneticLooks() as unknown as MagneticLooks,
  )

test('a magnetic planet lights its aurora from the ribbon art and draws field lines by the dock', async ({
  page,
}) => {
  const errors = await openGameOn(page, MAGNETIC_PLANET)
  await page.waitForFunction(() => {
    const looks = window.steampunkDebug!.features[
      'planet-mix'
    ].getMagneticLooks() as unknown as MagneticLooks
    return looks.skyBand?.isRibbonDrawn === true && (looks.fieldLines?.arcs ?? 0) > 0
  })
  const looks = await magneticLooks(page)
  expect(looks.skyBand?.colour).toBe('#5fb4ff')
  expect(looks.fieldLines?.arcs).toBeLessThanOrEqual(FIELD_ARC_CAP)
  expect(errors).toEqual([])
})

test('the relic planet shows no aurora and no field lines', async ({ page }) => {
  const errors = await openGameOn(page, MAGNETIC_PLANET)
  await page.waitForFunction(
    () =>
      (window.steampunkDebug!.features['planet-mix'].getMagneticLooks() as unknown as MagneticLooks)
        .skyBand !== null,
  )
  await page.evaluate((index) => window.steampunkDebug!.setPlanet(index), RELIC_PLANET)
  await page.waitForFunction(() => {
    const looks = window.steampunkDebug!.features[
      'planet-mix'
    ].getMagneticLooks() as unknown as MagneticLooks
    return looks.skyBand === null && looks.fieldLines?.arcs === 0
  })
  expect(errors).toEqual([])
})
