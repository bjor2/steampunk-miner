/**
 * The rig look ladder in the browser (#577): each upgrade track's look steps up at its first
 * threshold of `rigLook.json` and keeps changing on every purchase above its top step, painted as
 * glows on the car's own parts, so the frame stays inside #38's 150 draw calls; the boiler's step
 * swaps in its twin-drum look part (ticket 583), and each hull step lays its armour over the pod,
 * hiding no rig part, while the hull card names the owned step and grades the tail (ticket 585).
 * Asserted through `steampunkDebug` and test ids, never pixels; the boiler's and the hull's
 * screenshots are attached for review.
 */
import { expect, test, type Page } from '@playwright/test'
import type { DebugApi } from '../../src/debug/debugApi'
import { UI_ID_TEMPLATES } from '../../src/systems/views/screenIds'

declare global {
  interface Window {
    steampunkDebug?: DebugApi
  }
}

/** #38's frame budget. */
const FRAME_DRAW_CALLS_MAX = 150

/** Each track's first and top step in `rigLook.json` (Systems' table on #157; #554 for drill_power). */
const LADDERS = [
  { track: 'drill_power', first: 5, top: 100 },
  { track: 'drill_tip', first: 70, top: 280 },
  { track: 'engine', first: 2, top: 26 },
  { track: 'boiler', first: 16, top: 16 },
  { track: 'cargo_hold', first: 23, top: 33 },
  { track: 'hull', first: 20, top: 440 },
]

interface RigLookReading {
  track: string
  purchases: number
  step: number
  tail: number
  tint: string | null
}

async function openGame(page: Page): Promise<string[]> {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(String(error)))
  await page.goto('/?debug')
  await page.waitForFunction(() => window.steampunkDebug !== undefined)
  return errors
}

function setUpgrade(page: Page, track: string, purchases: number): Promise<void> {
  return page.evaluate(
    ([upgradeId, level]) => {
      const result = window.steampunkDebug!.setUpgrade(upgradeId, level as number)
      if (!result.ok) throw new Error(result.problems.join('; '))
    },
    [track, purchases] as const,
  )
}

async function rigLookOf(page: Page, track: string): Promise<RigLookReading> {
  const looks = await page.evaluate(() => {
    const result = window.steampunkDebug!.features['rig-look'].getLooks()
    return (result as unknown as { looks: RigLookReading[] }).looks
  })
  return looks.find((look) => look.track === track)!
}

function frameDrawCalls(page: Page): Promise<number> {
  return page.evaluate(() => {
    const result = window.steampunkDebug!.ui.getRenderStats()
    if (!result.ok) throw new Error(result.problems.join('; '))
    return result.stats.drawCalls
  })
}

test.describe('rig look ladder (#577)', () => {
  test('steps every track up at its first threshold, inside the frame budget', async ({ page }) => {
    const errors = await openGame(page)
    for (const { track, first } of LADDERS) {
      await setUpgrade(page, track, first - 1)
      await expect.poll(async () => (await rigLookOf(page, track)).tint).toBeNull()
      await setUpgrade(page, track, first)
      await expect.poll(async () => (await rigLookOf(page, track)).step).toBe(1)
    }
    expect(await frameDrawCalls(page)).toBeLessThanOrEqual(FRAME_DRAW_CALLS_MAX)
    expect(errors).toEqual([])
  })

  test('shows a different look on each of the first purchases past the top step', async ({
    page,
  }) => {
    const errors = await openGame(page)
    for (const { track, top } of LADDERS) {
      const tints: (string | null)[] = []
      for (const purchases of [top, top + 1, top + 2]) {
        await setUpgrade(page, track, purchases)
        await expect.poll(async () => (await rigLookOf(page, track)).purchases).toBe(purchases)
        tints.push((await rigLookOf(page, track)).tint)
      }
      expect(tints[1]).not.toBe(tints[0])
      expect(tints[2]).not.toBe(tints[1])
    }
    expect(await frameDrawCalls(page)).toBeLessThanOrEqual(FRAME_DRAW_CALLS_MAX)
    expect(errors).toEqual([])
  })
})

/** The boiler's one step (Systems' table on #157) and two tail points above it (ticket 583). */
const BOILER_COUNTS = [15, 16, 17, 40]
const BOILER_LOOK_PART = 'vehicle-look-boiler/twin-drum-boiler'
const VIEWPORTS = [
  { name: 'desktop', width: 1280, height: 720 },
  { name: 'phone', width: 360, height: 780 },
]

interface PartsReading {
  lookPartIds: string[]
  partIds: string[]
}

function vehiclePartsOf(page: Page): Promise<PartsReading> {
  return page.evaluate(() => {
    const parts = window.steampunkDebug!.vehicleParts()
    if (!parts.ok) throw new Error('no vehicle parts')
    return { lookPartIds: parts.lookPartIds, partIds: parts.partIds }
  })
}

test.describe('boiler rig look (ticket 583)', () => {
  for (const viewport of VIEWPORTS) {
    test(`swaps the twin-drum boiler in at 16 on every tail point, ${viewport.name}`, async ({
      page,
    }) => {
      await page.setViewportSize(viewport)
      const errors = await openGame(page)
      const readings: PartsReading[] = []
      for (const purchases of BOILER_COUNTS) {
        await setUpgrade(page, 'boiler', purchases)
        await expect.poll(async () => (await rigLookOf(page, 'boiler')).purchases).toBe(purchases)
        readings.push(await vehiclePartsOf(page))
        await test.info().attach(`boiler ${purchases}, ${viewport.name}`, {
          body: await page.screenshot(),
          contentType: 'image/png',
        })
      }
      expect(readings[0].lookPartIds).not.toContain(BOILER_LOOK_PART)
      expect(readings[0].partIds.some((id) => id.endsWith('-boiler'))).toBe(true)
      for (const reading of readings.slice(1)) {
        expect(reading.lookPartIds).toContain(BOILER_LOOK_PART)
        expect(reading.partIds.some((id) => /^t\d-boiler$/.test(id))).toBe(false)
      }
      expect(errors).toEqual([])
    })
  }
})

/**
 * Each hull step (Systems' table on #157) with Progression's name, the purchase before the first,
 * and two tail points above the top step (ticket 585).
 */
const HULL_COUNTS: readonly { purchases: number; part: string | null; fitting: string | null }[] = [
  { purchases: 19, part: null, fitting: null },
  { purchases: 20, part: 'riveted-plate', fitting: 'Fitting: Riveted plate' },
  { purchases: 80, part: 'banded-iron', fitting: 'Fitting: Banded iron' },
  { purchases: 140, part: 'brass-trimmed-armour', fitting: 'Fitting: Brass-trimmed armour' },
  { purchases: 260, part: 'layered-armour', fitting: 'Fitting: Layered armour' },
  { purchases: 440, part: 'filigree-armour', fitting: 'Fitting: Filigree armour' },
  { purchases: 441, part: 'filigree-armour', fitting: 'Fitting: Filigree armour · Grade 1' },
  { purchases: 540, part: 'filigree-armour', fitting: 'Fitting: Filigree armour · Grade 100' },
]

/** The tail grades the card must fit at 360 px (VS on #579): in full to 9999, then cut. */
const HULL_GRADES = [1, 101, 9_999, 1_000_000]
const HULL_TOP_STEP = 440
const HULL_CARD = `[data-testid="${UI_ID_TEMPLATES.workshopUpgradeBuy('hull')}"]`
const HULL_FITTING = `${HULL_CARD} [data-sheet-card-line]`

async function openAtTheWorkshop(page: Page): Promise<string[]> {
  const errors = await openGame(page)
  await page.evaluate(() => {
    const debug = window.steampunkDebug!
    for (const result of [debug.giveMoney('1e9'), debug.teleportToDock('upgrade')]) {
      if (!result.ok) throw new Error(result.problems.join('; '))
    }
  })
  await expect(page.locator(HULL_CARD)).toBeAttached({ timeout: 60_000 })
  return errors
}

/** How far the fitting fact runs past its card's right edge, in CSS pixels (0: inside it). */
async function fittingOverflowOf(page: Page): Promise<number> {
  const card = await page.locator(HULL_CARD).boundingBox()
  const fitting = await page.locator(HULL_FITTING).boundingBox()
  if (card === null || fitting === null) throw new Error('the hull card is not laid out')
  return Math.max(0, fitting.x + fitting.width - (card.x + card.width))
}

test.describe('hull rig look (ticket 585)', () => {
  for (const viewport of VIEWPORTS) {
    test(`lays each hull armour over the pod and names it on the card, ${viewport.name}`, async ({
      page,
    }) => {
      await page.setViewportSize(viewport)
      const errors = await openAtTheWorkshop(page)
      const rigParts: string[][] = []
      for (const { purchases, part, fitting } of HULL_COUNTS) {
        await setUpgrade(page, 'hull', purchases)
        await expect.poll(async () => (await rigLookOf(page, 'hull')).purchases).toBe(purchases)
        const reading = await vehiclePartsOf(page)
        rigParts.push(reading.partIds)
        const hullLooks = reading.lookPartIds.filter((id) => id.startsWith('vehicle-look-hull/'))
        expect(hullLooks).toEqual(part === null ? [] : [`vehicle-look-hull/${part}`])
        if (fitting === null) await expect(page.locator(HULL_FITTING)).not.toContainText('Fitting:')
        else await expect(page.locator(HULL_FITTING)).toContainText(fitting)
        await test.info().attach(`hull ${purchases}, ${viewport.name}`, {
          body: await page.screenshot(),
          contentType: 'image/png',
        })
      }
      for (const parts of rigParts) expect(parts).toEqual(rigParts[0])
      expect(errors).toEqual([])
    })

    test(`fits the hull tail grade at 1, 101, 9999 and 1e6 on the card, ${viewport.name}`, async ({
      page,
    }) => {
      await page.setViewportSize(viewport)
      const errors = await openAtTheWorkshop(page)
      for (const grade of HULL_GRADES) {
        await setUpgrade(page, 'hull', HULL_TOP_STEP + grade)
        await expect(page.locator(HULL_FITTING)).toContainText('· Grade ')
        await page.locator(HULL_CARD).scrollIntoViewIfNeeded()
        expect(await fittingOverflowOf(page), `grade ${grade}`).toBeLessThanOrEqual(1)
        await test.info().attach(`hull grade ${grade}, ${viewport.name}`, {
          body: await page.screenshot(),
          contentType: 'image/png',
        })
      }
      expect(errors).toEqual([])
    })
  }
})
