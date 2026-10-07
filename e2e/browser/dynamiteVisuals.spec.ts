/**
 * The dynamite looks in the browser (#215, the wiring of #145): the sized rack hangs at
 * `hull.rear` with a stick per size open on the planet, in place of the kernel's charge rack; and
 * an R24 blast front, played through the real layer by the presentation-only `previewBlast`,
 * stays inside the draw budget the layer declares (#213) and the frame inside #38's 150 calls.
 * Asserted through `steampunkDebug`, never pixels.
 */
import { expect, test, type Page } from '@playwright/test'
import type { DebugApi } from '../../src/debug/debugApi'

declare global {
  interface Window {
    steampunkDebug?: DebugApi
  }
}

/** #38's frame budget, the line the scene layers' 27 calls are carved from (#213). */
const FRAME_DRAW_CALLS_MAX = 150
/** Sizes 1 to 5 are open on planet 19 (blastingCharges.sizes: from planet 7, one every 3). */
const PLANET_WITH_FIVE_SIZES = 19
const RACK_ON_P19 = ['rack-frame', 'stick-1', 'stick-2', 'stick-3', 'stick-4', 'stick-5']
/** An R24 blast clears in 29 slices (K6 #189). */
const R24_SLICES = 29

interface FrontReading {
  frontsThrown: number
  peak: { drawCalls: number; instances: number }
  budget: { drawCalls: number; instances: number }
}

async function openGame(page: Page): Promise<string[]> {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(String(error)))
  await page.goto('/?debug')
  await page.waitForFunction(() => window.steampunkDebug !== undefined)
  return errors
}

function rackPartIds(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const result = window.steampunkDebug!.features['dynamite-visuals'].getRack()
    return (result as unknown as { partIds: string[] }).partIds
  })
}

function vehicleParts(page: Page) {
  return page.evaluate(() => {
    const result = window.steampunkDebug!.vehicleParts()
    if (!result.ok) throw new Error(result.problems.join('; '))
    return { partIds: result.partIds, mounted: result.mounted }
  })
}

function boltRackOnPlanet19(page: Page): Promise<void> {
  return page.evaluate((planet) => {
    const debug = window.steampunkDebug!
    for (const step of [() => debug.setPlanet(planet), () => debug.setCharges(1, 5, 5)]) {
      const result = step()
      if (!result.ok) throw new Error(result.problems.join('; '))
    }
  }, PLANET_WITH_FIVE_SIZES)
}

function frontReading(page: Page): Promise<FrontReading> {
  return page.evaluate(() => {
    const result = window.steampunkDebug!.features['dynamite-visuals'].getFront()
    return result as unknown as FrontReading
  })
}

function frameDrawCalls(page: Page): Promise<number> {
  return page.evaluate(() => {
    const result = window.steampunkDebug!.ui.getRenderStats()
    if (!result.ok) throw new Error(result.problems.join('; '))
    return result.stats.drawCalls
  })
}

test.describe('dynamite visuals (#215)', () => {
  test('hangs the sized rack at hull.rear with a stick per open size, not the old rack', async ({
    page,
  }) => {
    const errors = await openGame(page)
    expect(await rackPartIds(page)).toEqual([])

    await boltRackOnPlanet19(page)
    await expect.poll(() => rackPartIds(page)).toEqual(RACK_ON_P19)
    await expect
      .poll(async () => (await vehicleParts(page)).mounted)
      .toContainEqual({
        assetId: 'vehicle-dynamite-rack',
        attachId: 'hull.rear',
        partIds: expect.arrayContaining(RACK_ON_P19),
      })
    const { partIds } = await vehicleParts(page)
    expect(partIds).not.toContain('charge-rack')
    expect(errors).toEqual([])
  })

  test('draws an R24 blast front inside its declared budget and the frame budget', async ({
    page,
  }) => {
    const errors = await openGame(page)
    const started = await page.evaluate(() =>
      window.steampunkDebug!.features['dynamite-visuals'].previewBlast(10),
    )
    expect(started).toEqual({ ok: true })

    let busiestFrame = 0
    await expect
      .poll(async () => {
        busiestFrame = Math.max(busiestFrame, await frameDrawCalls(page))
        return (await frontReading(page)).frontsThrown
      })
      .toBeGreaterThanOrEqual(R24_SLICES)

    const { peak, budget } = await frontReading(page)
    expect(peak.instances).toBeGreaterThan(0)
    expect(peak.drawCalls).toBeLessThanOrEqual(budget.drawCalls)
    expect(peak.instances).toBeLessThanOrEqual(budget.instances)
    expect(busiestFrame).toBeLessThanOrEqual(FRAME_DRAW_CALLS_MAX)
    expect(errors).toEqual([])
  })
})
