/**
 * Drilling through laid casing in the real browser (ticket 843, Bjor's "can't get through the
 * casing" after #789), on the phone held upright and on desktop. The rig arrives on planet 2 with
 * planet 1's kit but only 6 drill tip pips (no tip major yet, so the scratch gate still reads the
 * starting tip) and casing grade 5, what planet 1's core asks. Off the pad it bores a short shaft,
 * meets a bore of its own width three metres to the side and then below, lined at grade 5 as the
 * vehicle lines one, and must cut in through the near lining and out through the far one. Before
 * the fix its stamp cut the rock behind the lining and the body stood on it.
 *
 * Through `window.steampunkDebug` only, judged on the pose (rulebook section 5); the Rapier spec
 * `src/physics/casingRedrill.test.ts` holds the same rows at every early tip and bore width.
 * Box Tester only, never on build workers.
 */
import { expect, test, type Page } from '@playwright/test'
import type { DebugApi } from '../../src/debug/debugApi'

declare global {
  interface Window {
    steampunkDebug?: DebugApi
  }
}

/** Planet 1's on-curve steps (`onCurveSteps(1)`) with the tip short of its first major. */
const ARRIVAL_STEPS = {
  drill_power: 12,
  drill_tip: 6,
  engine: 2,
  boiler: 4,
  cargo_hold: 22,
  hull: 20,
} as const
const PLANET = 2
const CASING_GRADE = 5
/** The shipped bore's stamp radius (#661: 0.45 m body + 0.5 m side clearance). */
const STAMP_RADIUS_MM = 950
const LINING_MM = 250
const HALF_BODY_MM = 450
const BORE_AHEAD_MM = 3000
/** Planet 2's pad reaches some 9 m past its dock; this clears it. */
const OFF_PAD_MM = 15000
const SHAFT_MM = 2500
/** From the start: past the far lining's outer edge by the body's half. */
const THROUGH_MM = BORE_AHEAD_MM + STAMP_RADIUS_MM + LINING_MM + HALF_BODY_MM
/** Software WebGL on a loaded box drives slowly; waits, not judgements. */
const MOVE_TIMEOUT_MS = 120_000
const SETTLE_MS = 2000

const LAYOUTS = [
  { name: 'phone-portrait', viewport: { width: 390, height: 844 }, isTouch: true },
  { name: 'desktop', viewport: { width: 1920, height: 1080 }, isTouch: false },
] as const

const CUTS = [
  { from: 'the side', aim: 'aim_left', facing: 'left' },
  { from: 'above', aim: 'aim_down', facing: 'down' },
] as const

type Cut = (typeof CUTS)[number]

interface RigPose {
  x: number
  y: number
  upx: number
  upy: number
}

for (const layout of LAYOUTS) {
  test.describe(`drilling through laid casing on ${layout.name} (ticket 843)`, () => {
    test.use({ viewport: layout.viewport, hasTouch: layout.isTouch })

    for (const cut of CUTS) {
      test(`cuts in and out through a grade-5 lined bore from ${cut.from}`, async ({ page }) => {
        test.setTimeout(600_000)
        const errors = await openPlanetTwoOnEarlyKit(page)
        await boreShortShaft(page)
        const start = await poseOf(page)
        await layLinedBoreAhead(page, start, cut)
        await holdUntilMoved(page, start, cut, THROUGH_MM)
        expect(errors).toEqual([])
      })
    }
  })
}

async function openPlanetTwoOnEarlyKit(page: Page): Promise<string[]> {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(String(error)))
  await page.goto('/?debug')
  await page.waitForFunction(() => window.steampunkDebug !== undefined)
  await page.evaluate(
    ({ planet, steps, grade }) => {
      const debug = window.steampunkDebug!
      debug.freezeEnemies(true)
      expectOk(debug.setPlanet(planet))
      for (const [track, step] of Object.entries(steps)) expectOk(debug.setUpgrade(track, step))
      expectOk(debug.setCasingGrade(grade))
      function expectOk(result: { ok: boolean; problems?: string[] }): void {
        if (!result.ok) throw new Error((result.problems ?? []).join('; '))
      }
    },
    { planet: PLANET, steps: ARRIVAL_STEPS, grade: CASING_GRADE },
  )
  await page.keyboard.press('KeyX')
  return errors
}

/** Off the pad to the left, then a short shaft down, settled on its bottom. */
async function boreShortShaft(page: Page): Promise<void> {
  const dock = await poseOf(page)
  await holdUntilMoved(page, dock, { aim: 'aim_left', facing: 'left' }, OFF_PAD_MM)
  await page.waitForTimeout(SETTLE_MS)
  const surface = await poseOf(page)
  await holdUntilMoved(page, surface, { aim: 'aim_down', facing: 'down' }, SHAFT_MM)
  await page.waitForTimeout(SETTLE_MS)
}

/** A bore of the rig's own width `BORE_AHEAD_MM` along the cut, lined as the rig lines one. */
async function layLinedBoreAhead(page: Page, start: RigPose, cut: Cut): Promise<void> {
  const along = alongOf(start, cut.facing)
  const centre = {
    x: Math.round(start.x + along.x * BORE_AHEAD_MM),
    y: Math.round(start.y + along.y * BORE_AHEAD_MM),
  }
  await page.evaluate(
    ({ x, y, radius, grade }) => {
      const debug = window.steampunkDebug!
      const carved = debug.carveCircle(x, y, radius, 255)
      if (!carved.ok) throw new Error(carved.problems.join('; '))
      const lined = debug.lineCasing(x, y, grade)
      if (!lined.ok) throw new Error(lined.problems.join('; '))
    },
    { ...centre, radius: STAMP_RADIUS_MM, grade: CASING_GRADE },
  )
}

/** Holds the cut's key until the rig is `distanceMm` along its facing from `from`, then lets go. */
async function holdUntilMoved(
  page: Page,
  from: RigPose,
  cut: Pick<Cut, 'aim' | 'facing'>,
  distanceMm: number,
): Promise<void> {
  await page.evaluate((aim) => window.steampunkDebug!.input.press(aim), cut.aim)
  await expect
    .poll(async () => movedAlong(from, await poseOf(page), cut.facing), {
      timeout: MOVE_TIMEOUT_MS,
    })
    .toBeGreaterThanOrEqual(distanceMm)
  await page.evaluate((aim) => window.steampunkDebug!.input.release(aim), cut.aim)
}

function poseOf(page: Page): Promise<RigPose> {
  return page.evaluate(() => {
    const snapshot = window.steampunkDebug!.snapshot()
    if (!snapshot.ok) throw new Error(snapshot.problems.join('; '))
    const pose = Object.values(snapshot.snapshot.state.players)[0].vehicle.pose
    if (pose === null) throw new Error('the vehicle has no pose')
    return { x: pose.x, y: pose.y, upx: pose.upx, upy: pose.upy }
  })
}

/** The unit vector of a facing in the rig's local frame (`facingVectorOf`), from its up. */
function alongOf(pose: RigPose, facing: Cut['facing']): { x: number; y: number } {
  const length = Math.hypot(pose.upx, pose.upy)
  const up = { x: pose.upx / length, y: pose.upy / length }
  return facing === 'left' ? { x: -up.y, y: up.x } : { x: -up.x, y: -up.y }
}

function movedAlong(from: RigPose, to: RigPose, facing: Cut['facing']): number {
  const along = alongOf(from, facing)
  return (to.x - from.x) * along.x + (to.y - from.y) * along.y
}
