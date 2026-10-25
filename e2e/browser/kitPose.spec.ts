/**
 * The hazard tools' deployed pose on the car (ticket 883, PK4c look: "each tool shows idle and
 * acting, including the 0.5 s tail, on the sockets T1 re-picks", with goldens at 360 px and
 * 1920x1080) in the preview build. On the committed planet 1 start, with a tool granted and its
 * hazard placed through `steampunkDebug`, the rig reports a pose away from the hazard (idle), by
 * it (acting), 29 ticks after leaving it (still acting: the tail) and 30 ticks after (idle). The
 * flask rack shows the uncorked flask vented while it is open. State through the debug reads
 * (`kitSockets().owned`, `vehicleParts().mounted`), never pixels; each pose's screen is attached
 * to the report for review, the size's golden.
 */
import { readFileSync } from 'node:fs'
import { expect, test, type Page, type TestInfo } from '@playwright/test'
import type { DebugApi } from '../../src/debug/debugApi'
import type { ScriptedCommand } from '../../src/systems/fastForward'

declare global {
  interface Window {
    steampunkDebug?: DebugApi
  }
}

interface Tile {
  tx: number
  ty: number
}

interface OwnedSocket {
  itemId: string
  heldFlasks: number
  isActing: boolean
}

const PLANET_1_START = readFileSync(
  new URL('../../scenarios/planet1-start.scenario.json', import.meta.url),
  'utf8',
)
/** Seed 83921's band-1 ground at column 20 (`scriptedSession.ts` GROUND). */
const GROUND: Tile = { tx: 20, ty: 298 }
/** Three columns over: no cell of GROUND's within the drill's reach. */
const AWAY: Tile = { tx: 23, ty: 298 }
/** `acting.tailTicks` in planet-kit.economy.json: 0.5 s at 60 steps/s. */
const TAIL_TICKS = 30
const DRAW_FRAMES_MS = 250
const SLOW_BOX_TIMEOUT_MS = 120_000
const VIEWPORTS = [
  { label: '360 px', size: { width: 360, height: 640 } },
  { label: '1920x1080', size: { width: 1920, height: 1080 } },
] as const
const TOOLS = [
  { itemId: 'scree_plough', hazard: 'rockfall', attach: 'kit.blade' },
  { itemId: 'shard_tongs', hazard: 'spinecrystal', attach: 'kit.grab' },
  { itemId: 'vent_vane', hazard: 'steamvent', attach: 'kit.mast' },
] as const

async function openStart(page: Page, size: { width: number; height: number }): Promise<string[]> {
  await page.setViewportSize(size)
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(String(error)))
  await page.goto(`/?debug&scenario=${encodeURIComponent(PLANET_1_START)}`)
  await page.waitForFunction(() => window.steampunkDebug !== undefined)
  return errors
}

async function grantWithHazard(page: Page, itemId: string, hazard: string | null): Promise<void> {
  await page.evaluate(
    ({ item, kind, tile }) => {
      const debug = window.steampunkDebug!
      const granted = debug.features['planet-kit'].grantKitItem(item)
      if (!granted.ok) throw new Error(granted.problems.join('; '))
      if (kind === null) return
      const placed = debug.placeHazard(kind, tile.tx, tile.ty)
      if (!placed.ok) throw new Error(placed.problems.join('; '))
    },
    { item: itemId, kind: hazard, tile: GROUND },
  )
}

/** Off the dock, so the rig's reports stand it in the ground. */
async function undock(page: Page): Promise<void> {
  await page.evaluate(() => {
    const debug = window.steampunkDebug!
    const snapshot = debug.snapshot()
    if (!snapshot.ok) throw new Error(snapshot.problems.join('; '))
    const result = debug.fastForward(1, [
      { tick: snapshot.snapshot.tick + 1, type: 'undock', payload: {} },
    ])
    if (!result.ok) throw new Error(result.problems.join('; '))
  })
}

/** The rig reports standing over `tile` facing down, `wait` ticks after the last tick. */
async function standOver(page: Page, tile: Tile, wait = 1): Promise<void> {
  await page.evaluate(
    ({ target, ticks }) => {
      const debug = window.steampunkDebug!
      const snapshot = debug.snapshot()
      if (!snapshot.ok) throw new Error(snapshot.problems.join('; '))
      const tick = snapshot.snapshot.tick + ticks
      const pose = {
        x: target.tx * 1000 + 500,
        y: (target.ty + 1) * 1000 + 500,
        vx: 0,
        vy: 0,
        upx: 0,
        upy: 1024,
        facing: 2,
        driving: false,
        thrusting: false,
        drilling: false,
        thrustTicks: 0,
        driveTicks: 0,
        drillTicks: 0,
        drive: { x: 0, y: 0 } as const,
      }
      const result = debug.fastForward(ticks, [{ tick, type: 'reportPose', payload: pose }])
      if (!result.ok) throw new Error(result.problems.join('; '))
    },
    { target: tile, ticks: wait },
  )
}

function ownedSockets(page: Page): Promise<OwnedSocket[]> {
  return page.evaluate(
    () =>
      (
        window.steampunkDebug!.features['planet-kit'].kitSockets() as unknown as {
          owned: OwnedSocket[]
        }
      ).owned,
  )
}

function mountedAssets(page: Page): Promise<Record<string, string>> {
  return page.evaluate(() => {
    const report = window.steampunkDebug!.vehicleParts() as {
      mounted?: { attachId: string; assetId: string }[]
    }
    return Object.fromEntries(
      (report.mounted ?? []).map((mount) => [mount.attachId, mount.assetId]),
    )
  })
}

/** The socket shows the pose; the screen is attached as this size's golden. */
async function expectPose(
  page: Page,
  expected: OwnedSocket,
  name: string,
  testInfo: TestInfo,
): Promise<void> {
  await expect.poll(() => ownedSockets(page)).toEqual([expected])
  await page.waitForTimeout(DRAW_FRAMES_MS)
  await testInfo.attach(`${name}-${testInfo.title}`, {
    body: await page.screenshot(),
    contentType: 'image/png',
  })
}

for (const { label, size } of VIEWPORTS) {
  test.describe(`hazard tools' deployed pose on the car (ticket 883) at ${label}`, () => {
    for (const tool of TOOLS) {
      test(`hangs the ${tool.itemId} idle, deploys it by its hazard and through its tail`, async ({
        page,
      }, testInfo) => {
        test.setTimeout(SLOW_BOX_TIMEOUT_MS)
        const errors = await openStart(page, size)
        await grantWithHazard(page, tool.itemId, tool.hazard)
        await undock(page)
        const idle = { itemId: tool.itemId, heldFlasks: 0, isActing: false }
        const acting = { ...idle, isActing: true }
        await standOver(page, AWAY)
        await expectPose(page, idle, `${tool.itemId}-idle`, testInfo)
        await expect
          .poll(() => mountedAssets(page))
          .toMatchObject({ [tool.attach]: `vehicle-item-${tool.itemId.replaceAll('_', '-')}` })
        await standOver(page, GROUND)
        await expectPose(page, acting, `${tool.itemId}-acting`, testInfo)
        await standOver(page, AWAY, TAIL_TICKS - 1)
        await expectPose(page, acting, `${tool.itemId}-tail`, testInfo)
        await standOver(page, AWAY, 1)
        await expectPose(page, idle, `${tool.itemId}-after-tail`, testInfo)
        expect(errors).toEqual([])
      })
    }

    test('racks the carried flask, and stands it vented while it is open', async ({
      page,
    }, testInfo) => {
      test.setTimeout(SLOW_BOX_TIMEOUT_MS)
      const errors = await openStart(page, size)
      await grantWithHazard(page, 'damp_flask', null)
      await expectPose(
        page,
        { itemId: 'damp_flask', heldFlasks: 1, isActing: false },
        'damp_flask-idle',
        testInfo,
      )
      const uncorked = await page.evaluate(() => {
        const debug = window.steampunkDebug!
        const snapshot = debug.snapshot()
        if (!snapshot.ok) throw new Error(snapshot.problems.join('; '))
        // A slice command: the e2e build sees only the kernel's command names.
        const uncork = { tick: snapshot.snapshot.tick + 1, type: 'planet-kit.uncork_flask' }
        return debug.fastForward(2, [{ ...uncork, payload: {} } as unknown as ScriptedCommand]).ok
      })
      expect(uncorked).toBe(true)
      await expectPose(
        page,
        { itemId: 'damp_flask', heldFlasks: 1, isActing: true },
        'damp_flask-vented',
        testInfo,
      )
      await expect
        .poll(() => mountedAssets(page))
        .toMatchObject({
          'cab.gauge': 'vehicle-item-damp-flask',
        })
      expect(errors).toEqual([])
    })
  })
}
