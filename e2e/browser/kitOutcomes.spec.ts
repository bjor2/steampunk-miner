/**
 * The hazard tools' outcomes on screen (ticket 882, PK4c T2: "each outcome reads on screen at
 * 360 px and 1920x1080, with goldens") in the preview build. On the committed planet 1 start,
 * with a tool granted and its hazard placed through `steampunkDebug`, a cut makes the outcome
 * happen and the overlay tags it over the cell it acted on: the plough's scree moved into the
 * open cell beside, the tongs' looted cluster, the vane's outward ride, and the flask's cleared
 * firedamp while it is open. State through the DOM's test ids and the debug reads, never pixels;
 * each screen is attached to the report for review, the size's golden.
 *
 * The page's clock is held from the cut until the DOM is read, so a busy box never outlives a
 * 1.5 s tag between two checks (`page-clock-holds-the-game`).
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

const PLANET_1_START = readFileSync(
  new URL('../../scenarios/planet1-start.scenario.json', import.meta.url),
  'utf8',
)
/** Seed 83921's band-1 ground at column 20 (`scriptedSession.ts` GROUND), plain ground below. */
const GROUND: Tile = { tx: 20, ty: 298 }
/** The cell past the drill's stamp from over GROUND facing down: the one the plough moves. */
const AHEAD: Tile = { tx: 20, ty: 297 }
/** Facing down with the planet's top up, the facing's left is +x. */
const LEFT_OF_AHEAD: Tile = { tx: 21, ty: 297 }
const DRILL_TICKS = 40
/** Far enough ahead that the page clock has not passed it when the pause lands. */
const HOLD_AFTER_MS = 2000
/** Long enough for the HUD to render the batch and the overlay to place the tag. */
const DRAW_FRAMES_MS = 250
const SLOW_BOX_TIMEOUT_MS = 120_000
/** The ticket's two sizes: a phone held upright and the desktop golden size. */
const VIEWPORTS = [
  { label: '360 px', size: { width: 360, height: 640 } },
  { label: '1920x1080', size: { width: 1920, height: 1080 } },
] as const
const TAG = '[data-testid="planet-kit-outcome-tag"]'

async function openStart(page: Page, size: { width: number; height: number }): Promise<string[]> {
  await page.setViewportSize(size)
  await page.clock.install()
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(String(error)))
  await page.goto(`/?debug&scenario=${encodeURIComponent(PLANET_1_START)}`)
  await page.waitForFunction(() => window.steampunkDebug !== undefined)
  const now = await page.evaluate(() => Date.now())
  await page.clock.pauseAt(now + HOLD_AFTER_MS)
  return errors
}

/** Holds a kit item and places hazards, through the debug API. */
async function prepare(
  page: Page,
  itemId: string,
  hazards: readonly { kind: string; tile: Tile }[],
): Promise<void> {
  await page.evaluate(
    ({ item, placed }) => {
      const debug = window.steampunkDebug!
      const granted = debug.features['planet-kit'].grantKitItem(item)
      if (!granted.ok) throw new Error(granted.problems.join('; '))
      for (const { kind, tile } of placed) {
        const result = debug.placeHazard(kind, tile.tx, tile.ty)
        if (!result.ok) throw new Error(result.problems.join('; '))
      }
    },
    { item: itemId, placed: hazards },
  )
}

/** Undocked, upright over each tile facing down in turn, the drill on it until it breaks. */
async function cutFromAbove(page: Page, tiles: readonly Tile[]): Promise<void> {
  await page.evaluate(
    ({ targets, drillTicks }) => {
      const debug = window.steampunkDebug!
      const snapshot = debug.snapshot()
      if (!snapshot.ok) throw new Error(snapshot.problems.join('; '))
      const first = snapshot.snapshot.tick + 1
      const commands: ScriptedCommand[] = [{ tick: first, type: 'undock', payload: {} }]
      targets.forEach((target, at) => {
        const tick = first + at * (drillTicks + 1)
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
        commands.push({ tick, type: 'reportPose', payload: pose })
        commands.push({
          tick: tick + drillTicks,
          type: 'drillTile',
          payload: { ...target, ticks: drillTicks },
        })
      })
      const result = debug.fastForward(targets.length * (drillTicks + 1) + 1, commands)
      if (!result.ok) throw new Error(result.problems.join('; '))
    },
    { targets: tiles, drillTicks: DRILL_TICKS },
  )
}

/** The outcome's tag is drawn; the screen is attached as this size's golden. */
async function expectTagShown(page: Page, outcome: string, testInfo: TestInfo): Promise<void> {
  await page.clock.runFor(DRAW_FRAMES_MS)
  const tag = page.locator(`${TAG}[data-outcome="${outcome}"]`)
  await expect(tag).toHaveCount(1)
  await expect(tag).toBeVisible()
  const box = await tag.boundingBox()
  expect(box?.width ?? 0).toBeGreaterThan(0)
  await testInfo.attach(`${outcome}-${testInfo.title}`, {
    body: await page.screenshot(),
    contentType: 'image/png',
  })
}

for (const { label, size } of VIEWPORTS) {
  test.describe(`hazard tool outcomes on screen (ticket 882) at ${label}`, () => {
    test('tags the plough’s scree moved into the open cell beside', async ({ page }, testInfo) => {
      test.setTimeout(SLOW_BOX_TIMEOUT_MS)
      const errors = await openStart(page, size)
      await cutFromAbove(page, [LEFT_OF_AHEAD])
      await prepare(page, 'scree_plough', [
        { kind: 'rockfall', tile: GROUND },
        { kind: 'rockfall', tile: AHEAD },
      ])
      await cutFromAbove(page, [GROUND])
      await expectTagShown(page, 'scree_shoved', testInfo)
      expect(errors).toEqual([])
    })

    test('tags the cluster the tongs loot', async ({ page }, testInfo) => {
      test.setTimeout(SLOW_BOX_TIMEOUT_MS)
      const errors = await openStart(page, size)
      await prepare(page, 'shard_tongs', [{ kind: 'spinecrystal', tile: GROUND }])
      await cutFromAbove(page, [GROUND])
      await expectTagShown(page, 'shard_looted', testInfo)
      expect(errors).toEqual([])
    })

    test('tags the vane’s ride outward over a vent', async ({ page }, testInfo) => {
      test.setTimeout(SLOW_BOX_TIMEOUT_MS)
      const errors = await openStart(page, size)
      const vent = { tx: GROUND.tx, ty: GROUND.ty - 2 }
      await cutFromAbove(page, [GROUND, AHEAD])
      await prepare(page, 'vent_vane', [{ kind: 'steamvent', tile: vent }])
      await cutFromAbove(page, [vent])
      await expectTagShown(page, 'vane_ride', testInfo)
      expect(errors).toEqual([])
    })

    test('tags the firedamp an open flask clears while it is open', async ({ page }, testInfo) => {
      test.setTimeout(SLOW_BOX_TIMEOUT_MS)
      const errors = await openStart(page, size)
      await prepare(page, 'damp_flask', [{ kind: 'firedamp', tile: GROUND }])
      await cutFromAbove(page, [GROUND])
      const uncorked = await page.evaluate(() => {
        const debug = window.steampunkDebug!
        const snapshot = debug.snapshot()
        if (!snapshot.ok) throw new Error(snapshot.problems.join('; '))
        const tick = snapshot.snapshot.tick + 1
        // A slice command: the e2e build sees only the kernel's command names.
        const uncork = { tick, type: 'planet-kit.uncork_flask', payload: {} }
        return debug.fastForward(2, [uncork as unknown as ScriptedCommand]).ok
      })
      expect(uncorked).toBe(true)
      await expectTagShown(page, 'firedamp_cleared', testInfo)
      const holdings = await page.evaluate(() =>
        window.steampunkDebug!.features['planet-kit'].kitHoldings(),
      )
      // The rig stands over GROUND, in the cell above it, where the flask was uncorked.
      const standing = { tx: GROUND.tx, ty: GROUND.ty + 1 }
      expect(holdings).toMatchObject({ ok: true, holdings: { flaskAt: standing } })
      expect(errors).toEqual([])
    })
  })
}
