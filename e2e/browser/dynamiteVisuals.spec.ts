/**
 * The dynamite looks in the browser (#215, the wiring of #145; D7 ticket 866): the typed rack
 * hangs at `hull.rear` with a bay per charge type open on the planet and a lit pip per charge
 * carried, in place of the kernel's charge rack; an R24 blast front, played through the real layer
 * by the presentation-only `previewBlast`, stays inside the draw budget the layer declares (#213)
 * and the frame inside #38's 150 calls; and the marks layer (rings, crater decals, fuse sparks)
 * declares its budget and never draws past it. Asserted through `steampunkDebug`, never pixels.
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
/** Types 1 and 2 have a size open on P19; the five size-1 charges carried light five pips. */
const RACK_ON_P19 = [
  'rack-frame',
  'slot-1',
  'pip-1-1',
  'pip-1-2',
  'pip-1-3',
  'pip-1-4',
  'pip-1-5',
  'slot-2',
]
/** An R24 blast clears in 29 slices (K6 #189). */
const R24_SLICES = 29

interface FrontReading {
  frontsThrown: number
  peak: { drawCalls: number; instances: number }
  budget: { drawCalls: number; instances: number }
}

interface MarksReading {
  craters: number
  rings: number
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

function marksReading(page: Page): Promise<MarksReading> {
  return page.evaluate(() => {
    const result = window.steampunkDebug!.features['dynamite-visuals'].getMarks()
    return result as unknown as MarksReading
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
  test('hangs the typed rack at hull.rear with a bay per open type and a pip per charge carried, not the old rack', async ({
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

  test('leaves a previewed blast its crater decal and keeps the marks layer inside its budget (D7 #866)', async ({
    page,
  }) => {
    const errors = await openGame(page)
    const started = await page.evaluate(() =>
      window.steampunkDebug!.features['dynamite-visuals'].previewBlast(6),
    )
    expect(started).toEqual({ ok: true })

    await expect.poll(async () => (await marksReading(page)).craters).toBe(1)
    const { peak, budget } = await marksReading(page)
    expect(peak.instances).toBeGreaterThan(0)
    expect(peak.drawCalls).toBeLessThanOrEqual(budget.drawCalls)
    expect(peak.instances).toBeLessThanOrEqual(budget.instances)
    expect(errors).toEqual([])
  })
})
