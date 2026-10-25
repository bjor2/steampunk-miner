/**
 * The rig look ladder in the browser (#577): each upgrade track's look steps up at its first
 * band edge of `rigLook.json` and keeps changing on every band above its top step (ticket 809: a
 * finish a band, named on the card with the exact level), painted as
 * glows on the car's own parts, so the frame stays inside #38's 150 draw calls; the boiler's step
 * swaps in its twin-drum look part (ticket 583), and each hull step lays its armour over the pod,
 * hiding no rig part, while the hull card names the owned band (tickets 585, 809).
 * Asserted through `steampunkDebug` and test ids, never pixels; the boiler's and the hull's
 * screenshots are attached for review.
 */
import { expect, test, type Page } from '@playwright/test'
import type { DebugApi } from '../../src/debug/debugApi'
import RIG_LOOK_FILE from '../../src/features/rig-look/rigLook.json'
import { UI_ID_TEMPLATES } from '../../src/systems/views/screenIds'

declare global {
  interface Window {
    steampunkDebug?: DebugApi
  }
}

/** #38's frame budget. */
const FRAME_DRAW_CALLS_MAX = 150

/** Each track's first and top authored step and its band in `rigLook.json` (ticket 809). */
const LADDERS = RIG_LOOK_FILE.tracks.map(({ track, steps, band }) => ({
  track,
  first: steps[0].from,
  top: steps[steps.length - 1].from,
  band: band.step,
}))

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

  test('shows a different look on each of the first bands past the top step', async ({ page }) => {
    const errors = await openGame(page)
    for (const { track, top, band } of LADDERS) {
      const tints: (string | null)[] = []
      for (const purchases of [top, top + band, top + 2 * band]) {
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

/**
 * The purchase before the boiler's first edge, each authored step on its band edge of 5 (tickets
 * 809 and 810: the twin-drum boiler, then a part fitted per step), and two finish bands above the
 * top step, which keep the top part.
 */
const BOILER_COUNTS: readonly { purchases: number; part: string | null }[] = [
  { purchases: 4, part: null },
  { purchases: 5, part: 'twin-drum-boiler' },
  { purchases: 10, part: 'gauged-boiler' },
  { purchases: 15, part: 'whistle-boiler' },
  { purchases: 20, part: 'manifold-boiler' },
  { purchases: 25, part: 'steam-drum-boiler' },
  { purchases: 30, part: 'firebox-boiler' },
  { purchases: 35, part: 'firebox-boiler' },
  { purchases: 40, part: 'firebox-boiler' },
]
const boilerLookIdOf = (part: string) => `vehicle-look-boiler/${part}`
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

test.describe('boiler rig look (tickets 583 and 810)', () => {
  for (const viewport of VIEWPORTS) {
    test(`fits each boiler step's part on its edge and keeps the top one above, ${viewport.name}`, async ({
      page,
    }) => {
      await page.setViewportSize(viewport)
      const errors = await openGame(page)
      const readings: PartsReading[] = []
      for (const { purchases } of BOILER_COUNTS) {
        await setUpgrade(page, 'boiler', purchases)
        await expect.poll(async () => (await rigLookOf(page, 'boiler')).purchases).toBe(purchases)
        readings.push(await vehiclePartsOf(page))
        await test.info().attach(`boiler ${purchases}, ${viewport.name}`, {
          body: await page.screenshot(),
          contentType: 'image/png',
        })
      }
      const boilerLookIds = BOILER_COUNTS.flatMap(({ part }) =>
        part === null ? [] : [boilerLookIdOf(part)],
      )
      BOILER_COUNTS.forEach(({ part }, at) => {
        const reading = readings[at]
        if (part === null) {
          expect(reading.lookPartIds.filter((id) => boilerLookIds.includes(id))).toEqual([])
          expect(reading.partIds.some((id) => /^t\d-boiler$/.test(id))).toBe(true)
          return
        }
        expect(reading.lookPartIds).toContain(boilerLookIdOf(part))
        expect(reading.partIds.some((id) => /^t\d-boiler$/.test(id))).toBe(false)
      })
      expect(errors).toEqual([])
    })
  }
})

/**
 * Each hull step on its band edge of 120 (ticket 809) with its band name (Progression's for
 * #584's five, the LK7 data strings of ticket 816 for the rest), the purchase before the first,
 * and the first two finish bands above the top step, named with the level.
 */
const HULL_COUNTS: readonly { purchases: number; part: string | null; fitting: string | null }[] = [
  { purchases: 119, part: null, fitting: null },
  { purchases: 120, part: 'riveted-plate', fitting: 'Fitting: Riveted plate' },
  { purchases: 240, part: 'banded-iron', fitting: 'Fitting: Banded iron' },
  { purchases: 360, part: 'brass-trimmed-armour', fitting: 'Fitting: Brass-trimmed armour' },
  { purchases: 480, part: 'layered-armour', fitting: 'Fitting: Layered armour' },
  { purchases: 600, part: 'filigree-armour', fitting: 'Fitting: Filigree armour' },
  { purchases: 720, part: 'keel-strake-armour', fitting: 'Fitting: Keel strake' },
  { purchases: 840, part: 'stern-plated-armour', fitting: 'Fitting: Stern plate' },
  { purchases: 960, part: 'bow-plated-armour', fitting: 'Fitting: Bow plate' },
  { purchases: 1080, part: 'corner-plated-armour', fitting: 'Fitting: Corner plates' },
  { purchases: 1200, part: 'hatch-ringed-armour', fitting: 'Fitting: Hatch ring' },
  { purchases: 1320, part: 'keel-riveted-armour', fitting: 'Fitting: Keel rivets' },
  { purchases: 1440, part: 'cap-riveted-armour', fitting: 'Fitting: Cap rivets' },
  { purchases: 1560, part: 'corner-riveted-armour', fitting: 'Fitting: Corner rivets' },
  { purchases: 1680, part: 'hatch-bolted-armour', fitting: 'Fitting: Hatch bolts' },
  { purchases: 1800, part: 'skirt-rail-armour', fitting: 'Fitting: Skirt rail' },
  { purchases: 1920, part: 'stern-skirt-armour', fitting: 'Fitting: Stern skirt' },
  { purchases: 2040, part: 'bow-skirt-armour', fitting: 'Fitting: Bow skirt' },
  { purchases: 2160, part: 'full-skirt-armour', fitting: 'Fitting: Full skirt' },
  { purchases: 2280, part: 'bossed-skirt-armour', fitting: 'Fitting: Skirt bosses' },
  { purchases: 2400, part: 'bossed-skirt-armour', fitting: 'Fitting: Gunmetal · L2,400' },
  { purchases: 2520, part: 'bossed-skirt-armour', fitting: 'Fitting: Bright brass · L2,520' },
]

/** The levels the card must fit at 360 px (#809's goldens): in full through the #681 long mode. */
const HULL_LEVELS = [2_401, 9_999, 1_000_000]
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

test.describe('hull rig look (tickets 585, 809, 816)', () => {
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

    test(`fits the hull level at 2401, 9999 and 1e6 on the card, ${viewport.name}`, async ({
      page,
    }) => {
      await page.setViewportSize(viewport)
      const errors = await openAtTheWorkshop(page)
      for (const level of HULL_LEVELS) {
        await setUpgrade(page, 'hull', level)
        await expect(page.locator(HULL_FITTING)).toContainText(
          ` · L${level.toLocaleString('en-US')}`,
        )
        await page.locator(HULL_CARD).scrollIntoViewIfNeeded()
        expect(await fittingOverflowOf(page), `level ${level}`).toBeLessThanOrEqual(1)
        await test.info().attach(`hull level ${level}, ${viewport.name}`, {
          body: await page.screenshot(),
          contentType: 'image/png',
        })
      }
      expect(errors).toEqual([])
    })
  }
})
