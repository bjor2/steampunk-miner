/**
 * The two shop buildings on the dock (#170, #175): read through `steampunkDebug`, never pixels.
 * Docking at each building opens that building's screen; docked at the Engineering Works the car
 * is drawn on the turntable (`workshop.platform`) within 30 ticks (TD acceptance 5); and with both
 * buildings in view at the 20 m zoom-out, on planet 1 and on planet 38's grown pad (with the three
 * add-ons of #222 standing), the frame stays within the #38 budget of 150 draw calls (TD acceptance
 * 7 and the 48-part amendment). Travelling onto planet 14 builds the scanner mast and, once the
 * travel card is gone and the player has left the bay, pans the camera to it once (TD lock on #197
 * Q4).
 */
import { expect, test, type Page } from '@playwright/test'
import type { DebugApi } from '../../src/debug/debugApi'

declare global {
  interface Window {
    steampunkDebug?: DebugApi
  }
}

const ROLL_TICKS = 30
const MAX_DRAW_CALLS = 150

interface DockAddOnsReport {
  planetIndex: number
  addOns: { id: string; rowId: string }[]
}

interface UnlockPanReport {
  tick: number
  armedRowId: string | null
  shown: { rowId: string; planetIndex: number; pan: { startTick: number } } | null
  cameraWeight: number
}

interface WorkshopRoll {
  presenceX: number
  platformX: number
  tick: number
}

async function openGame(page: Page): Promise<string[]> {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(String(error)))
  await page.goto('/?debug')
  await page.waitForFunction(() => window.steampunkDebug !== undefined)
  return errors
}

async function teleportToDock(page: Page, bay: string): Promise<number> {
  return page.evaluate((target) => {
    const debug = window.steampunkDebug!
    const result = debug.teleportToDock(target)
    if (!result.ok) throw new Error(result.problems.join('; '))
    const snapshot = debug.snapshot()
    if (!snapshot.ok) throw new Error(snapshot.problems.join('; '))
    return snapshot.snapshot.tick
  }, bay)
}

function openScreenBay(page: Page): Promise<string | null> {
  return page.evaluate(() => {
    const result = window.steampunkDebug!.ui.getBayPresentation()
    if (!result.ok) throw new Error(result.problems.join('; '))
    return result.presentation.shutter.phase === 'open' ? result.presentation.shutter.bay : null
  })
}

function shutterPhase(page: Page): Promise<string> {
  return page.evaluate(() => {
    const result = window.steampunkDebug!.ui.getBayPresentation()
    return result.ok ? result.presentation.shutter.phase : 'closed'
  })
}

function workshopRoll(page: Page): Promise<WorkshopRoll> {
  return page.evaluate(() => {
    const read = window.steampunkDebug!.features['dock-buildings'].getWorkshopRoll
    const result = read() as { ok: boolean; problems?: string[] } & WorkshopRoll
    if (!result.ok) throw new Error(result.problems?.join('; '))
    return result
  })
}

function dockAddOns(page: Page): Promise<DockAddOnsReport> {
  return page.evaluate(() => {
    const result = window.steampunkDebug!.features['dock-buildings'].getDockAddOns() as {
      ok: boolean
      problems?: string[]
    } & DockAddOnsReport
    if (!result.ok) throw new Error(result.problems?.join('; '))
    return result
  })
}

function unlockPan(page: Page): Promise<UnlockPanReport> {
  return page.evaluate(() => {
    const read = window.steampunkDebug!.features['dock-buildings'].getUnlockPan
    return read() as { ok: true } & UnlockPanReport
  })
}

/** Docked at the Exchange on planet 13 with the fee and the core paid up, then a real travel. */
function travelFromPlanet13(page: Page): Promise<void> {
  return page.evaluate(() => {
    const debug = window.steampunkDebug!
    const steps = [
      () => debug.setPlanet(13),
      () => debug.teleportToDock('sell'),
      () => debug.giveMoney('1e40'),
      () => debug.setCoreFragments(100000),
    ]
    for (const step of steps) {
      const result = step()
      if (!result.ok) throw new Error(result.problems.join('; '))
    }
    const snapshot = debug.snapshot()
    if (!snapshot.ok) throw new Error(snapshot.problems.join('; '))
    const tick = snapshot.snapshot.tick
    const travelled = debug.fastForward(1, [{ tick, type: 'travel', payload: { toPlanet: 14 } }])
    if (!travelled.ok) throw new Error(travelled.problems.join('; '))
  })
}

async function settledDrawCalls(page: Page): Promise<number> {
  let previous = -1
  await expect
    .poll(
      async () => {
        const { groundBlocks } = await renderStats(page)
        const isSettled = groundBlocks > 0 && groundBlocks === previous
        previous = groundBlocks
        return isSettled
      },
      { timeout: 60_000, intervals: [1000] },
    )
    .toBe(true)
  return (await renderStats(page)).drawCalls
}

function renderStats(page: Page) {
  return page.evaluate(() => {
    const result = window.steampunkDebug!.ui.getRenderStats()
    if (!result.ok) throw new Error(result.problems.join('; '))
    return result.stats
  })
}

test.describe('dock buildings (#175)', () => {
  test('opens the Sell screen at the Exchange and the Upgrade screen at the Works', async ({
    page,
  }) => {
    test.setTimeout(120_000)
    const errors = await openGame(page)
    await teleportToDock(page, 'sell')
    await expect.poll(() => openScreenBay(page), { timeout: 60_000 }).toBe('sell')
    await page.evaluate(() => window.steampunkDebug!.input.tap('ui_cancel'))
    // The shutter runs on frames, which software GL under load makes slow: let it close first.
    await expect.poll(() => shutterPhase(page), { timeout: 60_000 }).toBe('closed')
    await teleportToDock(page, 'upgrade')
    await expect.poll(() => openScreenBay(page), { timeout: 60_000 }).toBe('upgrade')
    expect(errors).toEqual([])
  })

  test('draws the car on the Works turntable within 30 ticks of docking there', async ({
    page,
  }) => {
    test.setTimeout(120_000)
    const errors = await openGame(page)
    const dockTick = await teleportToDock(page, 'upgrade')
    await expect
      .poll(async () => (await workshopRoll(page)).tick - dockTick, { timeout: 30_000 })
      .toBeGreaterThanOrEqual(ROLL_TICKS)
    const roll = await workshopRoll(page)
    expect(Math.abs(roll.presenceX - roll.platformX)).toBeLessThan(0.001)
    expect(errors).toEqual([])
  })

  test('keeps both buildings in view at 20 m within 150 draw calls, on planet 1 and planet 38', async ({
    page,
  }) => {
    test.setTimeout(240_000)
    const errors = await openGame(page)
    await page.setViewportSize({ width: 1920, height: 1080 })
    await page.evaluate(() => {
      window.steampunkDebug!.ui.setZoom(20)
      // A low pinned scale keeps the frame quick on software GL; it never changes what is drawn.
      window.steampunkDebug!.ui.setRenderScale(0.5)
    })
    await teleportToDock(page, 'sell')
    expect(await settledDrawCalls(page)).toBeLessThanOrEqual(MAX_DRAW_CALLS)
    await page.evaluate(() => {
      const result = window.steampunkDebug!.setPlanet(38)
      if (!result.ok) throw new Error(result.problems.join('; '))
      // The platform lands docked at the Exchange; leave it to drive over to the Works.
      window.steampunkDebug!.input.tap('ui_cancel')
    })
    await teleportToDock(page, 'upgrade')
    expect((await dockAddOns(page)).addOns.map((addOn) => addOn.rowId)).toEqual([
      'scanner_station',
      'research_lab',
      'drone_bay',
    ])
    expect(await settledDrawCalls(page)).toBeLessThanOrEqual(MAX_DRAW_CALLS)
    expect(errors).toEqual([])
  })

  test('builds the scanner mast on arriving at planet 14 and pans to it once', async ({ page }) => {
    test.setTimeout(120_000)
    const errors = await openGame(page)
    // The add-ons piece follows the session once the scene is up, as it is long before any travel.
    await expect
      .poll(async () => (await renderStats(page)).groundBlocks, { timeout: 60_000 })
      .toBeGreaterThan(0)
    await travelFromPlanet13(page)
    expect(await dockAddOns(page)).toMatchObject({
      planetIndex: 14,
      addOns: [{ id: 'scanner_mast', rowId: 'scanner_station' }],
    })
    // The platform lands docked, under the bay screen: the pan waits for the player to leave the
    // Exchange and for the travel card (up to 10 s) to go, then lasts under 2 s: poll every frame.
    expect((await unlockPan(page)).armedRowId).toBe('scanner_station')
    await page.evaluate(() => window.steampunkDebug!.input.tap('ui_cancel'))
    await page.waitForFunction(
      () => {
        const read = window.steampunkDebug!.features['dock-buildings'].getUnlockPan
        return (read() as { ok: true } & UnlockPanReport).cameraWeight > 0
      },
      undefined,
      { timeout: 60_000, polling: 'raf' },
    )
    const pan = await unlockPan(page)
    expect(pan.shown).toMatchObject({ rowId: 'scanner_station', planetIndex: 14 })
    expect(pan.armedRowId).toBeNull()
    await expect.poll(async () => (await unlockPan(page)).cameraWeight, { timeout: 60_000 }).toBe(0)
    expect((await unlockPan(page)).shown?.pan.startTick).toBe(pan.shown?.pan.startTick)
    expect(errors).toEqual([])
  })
})
