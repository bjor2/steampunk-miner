/**
 * The high-speed camera on the preview build (#316 camera lock, ticket 338): while a strong drill
 * digs straight down on P1 and P10 at 16:9, a once-a-second read of `getCameraView()` shows at
 * least the felt speed times 1 s of ground ahead, a view between the player's 12 m and the 20 m
 * shape cap, and `getRenderStats()` stays inside the #38 budget. State only, never pixels. The
 * steady-state law, the stop-start hold and the 30/144 frame rates are pinned in
 * `src/systems/render/speedFraming.test.ts`. Below 3 m/s the camera follows an eased copy of the
 * body (ticket 515): a per-frame read of `followLagMetres` stays 0 at rest, under 0.35 m on the
 * stock rig's drive and dig, and shows no snap artefact across a teleport, a respawn tow or the
 * dock showcase. The ease law is pinned in `src/systems/render/cameraFollow.test.ts`.
 */
import { expect, test, type Page } from '@playwright/test'
import type { DebugApi } from '../../src/debug/debugApi'

declare global {
  interface Window {
    steampunkDebug?: DebugApi
  }
}

const PLAYER_ZOOM_M = 12
const CAP_16_9_M = 20
const MAX_GROUND_BLOCKS = 48
const MAX_DRAW_CALLS = 150
/** The law holds while framing manages it: up to 16 cells/s at 16:9 (GD lock). */
const FRAMED_SPEED_LIMIT = 16
/** The 0.5 s pull-out ease trails a rising felt speed by a few percent; steady, it is exact. */
const EASE_TRAIL_SHARE = 0.97
/** Long enough on software GL to drive off the pad before drilling down. */
const DRIVE_OFF_PAD_MS = 6000
const SAMPLE_SECONDS = 10
/** The TD's simulated peak was 0.31 to 0.33 m on the stored 1/10/20 tracks (ticket 515). */
const MAX_FOLLOW_LAG_M = 0.35
/** A body at rest sits on the eased point; Rapier's settle may leave a hair. */
const REST_LAG_M = 1e-3
/** The lean starts here and the ease is gone (`SPEED_FRAMING.leadStartCellsPerSecond`). */
const LEAD_START_CELLS_PER_SECOND = 3
/** Long enough for the 120-tick wreck wait and the tow to the dock. */
const RESPAWN_MS = 5000

interface SpeedSample {
  feltSpeedCellsPerSecond: number
  groundAheadMetres: number
  viewShortAxisMetres: number
  groundBlocks: number
  drawCalls: number
}

interface FollowSample {
  followLagMetres: number
  feltSpeedCellsPerSecond: number
}

async function openGame(page: Page): Promise<string[]> {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(String(error)))
  await page.setViewportSize({ width: 1920, height: 1080 })
  await page.goto('/?debug')
  await page.waitForFunction(() => window.steampunkDebug!.getPhysicsStats().ok, null, {
    timeout: 60_000,
  })
  return errors
}

/** On `planet`, a drill that cuts at once and nothing to fight: off the pad, then down. */
async function digDownOn(page: Page, planet: number): Promise<void> {
  await page.evaluate((index) => {
    const debug = window.steampunkDebug!
    debug.setPlanet(index)
    for (const track of ['drill_power', 'drill_tip', 'engine']) debug.setUpgrade(track, 300)
    debug.freezeEnemies(true)
    debug.ui.setZoom(12)
    debug.input.press('aim_right')
  }, planet)
  await page.waitForTimeout(DRIVE_OFF_PAD_MS)
  await page.evaluate(() => {
    window.steampunkDebug!.input.release('aim_right')
    window.steampunkDebug!.input.press('aim_down')
  })
}

function readSpeedSample(page: Page): Promise<SpeedSample> {
  return page.evaluate(() => {
    const camera = window.steampunkDebug!.ui.getCameraView()
    const render = window.steampunkDebug!.ui.getRenderStats()
    if (!camera.ok) throw new Error(camera.problems.join('; '))
    if (!render.ok) throw new Error(render.problems.join('; '))
    return {
      feltSpeedCellsPerSecond: camera.view.feltSpeedCellsPerSecond,
      groundAheadMetres: camera.view.groundAheadMetres,
      viewShortAxisMetres: camera.view.viewShortAxisMetres,
      groundBlocks: render.stats.groundBlocks,
      drawCalls: render.stats.drawCalls,
    }
  })
}

async function samplePerSecond(page: Page): Promise<SpeedSample[]> {
  const samples: SpeedSample[] = []
  for (let second = 0; second < SAMPLE_SECONDS; second++) {
    await page.waitForTimeout(1000)
    samples.push(await readSpeedSample(page))
  }
  return samples
}

/** Every frame's ease read for `durationMs`, so a one-frame snap artefact cannot slip between reads. */
function sampleFollowEachFrame(page: Page, durationMs: number): Promise<FollowSample[]> {
  return page.evaluate(
    (duration) =>
      new Promise<FollowSample[]>((resolve) => {
        const samples: FollowSample[] = []
        const start = performance.now()
        const read = () => {
          const camera = window.steampunkDebug!.ui.getCameraView()
          if (!camera.ok) throw new Error(camera.problems.join('; '))
          const { followLagMetres, feltSpeedCellsPerSecond } = camera.view
          samples.push({ followLagMetres, feltSpeedCellsPerSecond })
          if (performance.now() - start < duration) requestAnimationFrame(read)
          else resolve(samples)
        }
        requestAnimationFrame(read)
      }),
    durationMs,
  )
}

function maxLagOf(samples: FollowSample[]): number {
  return Math.max(...samples.map((sample) => sample.followLagMetres))
}

function isEasedSample(sample: FollowSample): boolean {
  const speed = sample.feltSpeedCellsPerSecond
  return speed > 0 && speed < LEAD_START_CELLS_PER_SECOND
}

/** Stock P1 rig, nothing to fight, settled on the pad. */
async function settleOnPad(page: Page): Promise<void> {
  await page.evaluate(() => {
    const debug = window.steampunkDebug!
    debug.freezeEnemies(true)
    debug.ui.setZoom(12)
  })
  await page.waitForTimeout(3000)
}

/** Off the pad, then down on the stock drill, which digs P1 at about 1.5 m/s (#441). */
async function driveAndDigSlowly(page: Page): Promise<FollowSample[]> {
  await page.evaluate(() => window.steampunkDebug!.input.press('aim_right'))
  const drive = await sampleFollowEachFrame(page, DRIVE_OFF_PAD_MS)
  await page.evaluate(() => {
    window.steampunkDebug!.input.release('aim_right')
    window.steampunkDebug!.input.press('aim_down')
  })
  const dig = await sampleFollowEachFrame(page, SAMPLE_SECONDS * 1000)
  await page.evaluate(() => window.steampunkDebug!.input.release('aim_down'))
  return [...drive, ...dig]
}

/** The jumps the camera snaps across instead of easing: a teleport, a wreck and tow, a showcase. */
type Jump = 'teleport' | 'respawn' | 'showcase'

/** Runs one jump the camera must snap across, then reads every frame after it. */
async function followAcross(page: Page, jump: Jump, durationMs: number): Promise<FollowSample[]> {
  await page.evaluate((name) => {
    const debug = window.steampunkDebug!
    const jumps = {
      teleport: () => debug.teleportToDepthTiles(20),
      respawn: () => debug.setHull('0'),
      showcase: () => debug.teleportToDock('upgrade'),
    }
    const result = jumps[name]()
    if (!result.ok) throw new Error(result.problems.join('; '))
  }, jump)
  return sampleFollowEachFrame(page, durationMs)
}

function expectFramedAhead(sample: SpeedSample): void {
  const framedSpeed = Math.min(sample.feltSpeedCellsPerSecond, FRAMED_SPEED_LIMIT)
  expect(sample.groundAheadMetres).toBeGreaterThanOrEqual(framedSpeed * 1 * EASE_TRAIL_SHARE)
  expect(sample.viewShortAxisMetres).toBeGreaterThanOrEqual(PLAYER_ZOOM_M - 1e-6)
  expect(sample.viewShortAxisMetres).toBeLessThanOrEqual(CAP_16_9_M + 1e-6)
  expect(sample.groundBlocks).toBeLessThanOrEqual(MAX_GROUND_BLOCKS)
  expect(sample.drawCalls).toBeLessThanOrEqual(MAX_DRAW_CALLS)
}

test.describe('high-speed camera (ticket 338)', () => {
  for (const planet of [1, 10]) {
    test(`keeps 1 s of ground ahead within the zoom band and the #38 budget while digging P${planet}`, async ({
      page,
    }) => {
      test.setTimeout(180_000)
      const errors = await openGame(page)
      await digDownOn(page, planet)
      const samples = await samplePerSecond(page)
      await test.info().attach(`P${planet} per-second camera`, {
        body: JSON.stringify(samples, null, 2),
        contentType: 'application/json',
      })
      for (const sample of samples) expectFramedAhead(sample)
      expect(samples.some((sample) => sample.feltSpeedCellsPerSecond > 0)).toBe(true)
      expect(errors).toEqual([])
    })
  }
})

test.describe('slow-speed camera ease (ticket 515)', () => {
  test('trails the body under 0.35 m below 3 m/s, not at all at rest, and snaps across jumps', async ({
    page,
  }) => {
    test.setTimeout(180_000)
    const errors = await openGame(page)
    await settleOnPad(page)
    const rest = await sampleFollowEachFrame(page, 1000)
    const slow = await driveAndDigSlowly(page)
    const teleport = await followAcross(page, 'teleport', 1500)
    const respawn = await followAcross(page, 'respawn', RESPAWN_MS)
    const showcase = await followAcross(page, 'showcase', 2000)
    const runs = { rest, slow, teleport, respawn, showcase }
    const maxLags = Object.fromEntries(
      Object.entries(runs).map(([name, samples]) => [name, maxLagOf(samples)]),
    )
    await test.info().attach('max follow lag per run, metres', {
      body: JSON.stringify(maxLags, null, 2),
      contentType: 'application/json',
    })
    expect(maxLagOf(rest)).toBeLessThanOrEqual(REST_LAG_M)
    expect(slow.some(isEasedSample)).toBe(true)
    for (const samples of [slow, teleport, respawn, showcase]) {
      expect(maxLagOf(samples)).toBeLessThan(MAX_FOLLOW_LAG_M)
    }
    expect(errors).toEqual([])
  })
})
