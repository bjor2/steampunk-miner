/**
 * The analog touch stick (ticket 791, overriding #173 section 3's 8 directions on the move
 * actions), on the touch cells, the iPhone 13 WebKit and Pixel 7 Chromium projects among them:
 * sweeping the stick through a circle turns the drill's aim smoothly, diagonals included, never
 * in 4 or 8 steps; the drive grows with the push from the deadzone's edge to the rim, and the rig
 * drives slower on half a push than on a full one; and a push down and to the left digs a diagonal
 * shaft. State through `window.steampunkDebug` (`input.getVehicleIntent`, the snapshot's pose),
 * never pixels.
 *
 * The thumb is a real touch on Chromium (CDP `Input.dispatchTouchEvent`). WebKit has no CDP, so
 * there the same pointer handlers take the mouse, which the stick reads alike (pointer events).
 */
import { expect, test, type Page } from '@playwright/test'
import type { VehicleIntent } from '../../../src/systems/vehicle/vehicleIntent'
import { skipWhereEngineIsMissing } from '../mobile/mobileHelpers'
import { boxOf, currentCell, openGame } from './screenHelpers'

/** The stick's travel (`STICK_RADIUS_PX`) and its 20% deadzone. */
const STICK_RADIUS_PX = 56
const DEADZONE_PX = STICK_RADIUS_PX * 0.2
/** At least this many angles round the circle (the ticket's done-when). */
const SWEEP_ANGLES = 32
const DRIVE_OFF_PAD_MS = 2_000
const DIG_MS = 4_000
const MM_PER_METRE = 1000

skipWhereEngineIsMissing()

test.beforeEach(() => {
  test.skip(!currentCell().isTouch, 'the stick plays on touch screens')
})

interface Thumb {
  land(x: number, y: number): Promise<void>
  move(x: number, y: number): Promise<void>
  lift(): Promise<void>
}

/** A touch on Chromium, the mouse on WebKit, on the stick zone's pointer handlers. */
async function thumbOf(page: Page, browserName: string): Promise<Thumb> {
  if (browserName !== 'chromium') {
    return {
      land: async (x, y) => {
        await page.mouse.move(x, y)
        await page.mouse.down()
      },
      move: (x, y) => page.mouse.move(x, y),
      lift: () => page.mouse.up(),
    }
  }
  const cdp = await page.context().newCDPSession(page)
  type TouchType = 'touchStart' | 'touchMove' | 'touchEnd'
  const touch = (type: TouchType, points: { x: number; y: number; id: number }[]) =>
    cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points })
  return {
    land: async (x, y) => void (await touch('touchStart', [{ x, y, id: 1 }])),
    move: async (x, y) => void (await touch('touchMove', [{ x, y, id: 1 }])),
    lift: async () => void (await touch('touchEnd', [])),
  }
}

async function stickCentreOf(page: Page): Promise<{ x: number; y: number }> {
  const zone = await boxOf(page, 'touch-stick-zone')
  return { x: zone.left + zone.width / 2, y: zone.top + zone.height / 2 }
}

function intentOf(page: Page): Promise<VehicleIntent> {
  return page.evaluate(() => {
    const result = window.steampunkDebug!.input.getVehicleIntent()
    if (!result.ok) throw new Error(result.problems.join('; '))
    return result.intent
  })
}

/** The reported pose in metres and mm/s, with its aim. */
function poseOf(page: Page) {
  return page.evaluate((mmPerMetre) => {
    const snapshot = window.steampunkDebug!.snapshot()
    if (!snapshot.ok) throw new Error(snapshot.problems.join('; '))
    const { pose } = Object.values(snapshot.snapshot.state.players)[0].vehicle
    if (pose === null) throw new Error('the vehicle has no pose')
    return { x: pose.x / mmPerMetre, y: pose.y / mmPerMetre, vx: pose.vx, aim: pose.aim }
  }, MM_PER_METRE)
}

/** Each step's aim unwrapped across the turn, so a full sweep reads as one rising run. */
function unwrapped(aims: readonly number[]): number[] {
  return aims.reduce<number[]>((run, aim) => {
    const last = run.at(-1)
    if (last === undefined) return [aim]
    let next = aim
    while (next < last) next += 64
    return [...run, next]
  }, [])
}

test.describe('screen matrix: analog touch stick (ticket 791)', () => {
  test('turns the drill aim smoothly as the thumb sweeps a full circle, diagonals included', async ({
    page,
    browserName,
  }) => {
    const errors = await openGame(page, currentCell())
    const thumb = await thumbOf(page, browserName)
    const centre = await stickCentreOf(page)
    await thumb.land(centre.x, centre.y)
    const aims: number[] = []
    for (let step = 0; step <= SWEEP_ANGLES; step++) {
      const angle = (step / SWEEP_ANGLES) * 2 * Math.PI
      await thumb.move(centre.x + Math.cos(angle) * 48, centre.y - Math.sin(angle) * 48)
      aims.push((await intentOf(page)).aim as number)
    }
    await thumb.lift()
    const run = unwrapped(aims)
    run.slice(1).forEach((aim, at) => expect(aim).toBeGreaterThan(run[at]))
    expect(new Set(aims.map((aim) => aim % 64)).size).toBeGreaterThanOrEqual(SWEEP_ANGLES)
    expect(aims).toEqual(expect.arrayContaining([8, 24, 40, 56]))
    expect((await intentOf(page)).aim).toBeNull()
    expect(errors).toEqual([])
  })

  test('drives harder the further the thumb pushes, from the deadzone to the rim', async ({
    page,
    browserName,
  }) => {
    const errors = await openGame(page, currentCell())
    const thumb = await thumbOf(page, browserName)
    const centre = await stickCentreOf(page)
    await thumb.land(centre.x, centre.y)
    const drives: number[] = []
    for (const push of [14, 22, 30, 38, 46, STICK_RADIUS_PX]) {
      await thumb.move(centre.x + push, centre.y)
      drives.push((await intentOf(page)).moveX)
    }
    await thumb.move(centre.x + DEADZONE_PX + (STICK_RADIUS_PX - DEADZONE_PX) / 2, centre.y)
    const halfway = (await intentOf(page)).moveX
    await thumb.lift()
    drives.slice(1).forEach((drive, at) => expect(drive).toBeGreaterThan(drives[at]))
    expect(drives.at(-1)).toBe(64)
    expect(Math.abs(halfway - 32)).toBeLessThanOrEqual(1)
    expect(errors).toEqual([])
  })

  test('drives the rig slower on half a push than on a full one', async ({ page, browserName }) => {
    const errors = await openGame(page, currentCell())
    const thumb = await thumbOf(page, browserName)
    const centre = await stickCentreOf(page)
    const speedAfter = async (push: number) => {
      await thumb.land(centre.x, centre.y)
      await thumb.move(centre.x - push, centre.y)
      await page.waitForTimeout(1_500)
      const { vx } = await poseOf(page)
      await thumb.lift()
      await page.waitForTimeout(1_000)
      return Math.abs(vx)
    }
    const half = await speedAfter(DEADZONE_PX + (STICK_RADIUS_PX - DEADZONE_PX) / 2)
    const full = await speedAfter(STICK_RADIUS_PX)
    expect(half).toBeGreaterThan(0)
    expect(half).toBeLessThan(full * 0.75)
    expect(errors).toEqual([])
  })

  test('digs a diagonal shaft down and to the left on a push down-left', async ({
    page,
    browserName,
  }) => {
    const errors = await openGame(page, currentCell())
    await page.evaluate(() => {
      const debug = window.steampunkDebug!
      debug.setPlanet(1)
      debug.setUpgrade('drill_power', 12)
      debug.ui.setZoom(12)
      debug.input.press('aim_left')
    })
    await page.waitForTimeout(DRIVE_OFF_PAD_MS)
    await page.evaluate(() => window.steampunkDebug!.input.release('aim_left'))
    const start = await poseOf(page)
    const thumb = await thumbOf(page, browserName)
    const centre = await stickCentreOf(page)
    await thumb.land(centre.x, centre.y)
    await thumb.move(centre.x - 40, centre.y + 40)
    await expect.poll(async () => (await poseOf(page)).aim).toBe(40)
    await page.waitForTimeout(DIG_MS)
    const end = await poseOf(page)
    await thumb.lift()
    expect(start.x - end.x).toBeGreaterThan(1.5)
    expect(start.y - end.y).toBeGreaterThan(1.5)
    expect(errors).toEqual([])
  })
})
