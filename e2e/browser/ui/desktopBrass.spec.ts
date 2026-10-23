/**
 * The desktop brass art pass (spec #678, ticket 770, GD lock 23 Oct) at 1280x800 and 1920x1080,
 * plus a 360x640 phone: the docked sheet and the gauge cluster wear the desktop rail frames
 * (`art.dockFrame`, `art.clusterFrame`) with their rivets repeated a tile at a time, never
 * stretched, while a phone keeps the sheet and glass frames as before; and the strip and the
 * docked sheet hold through the NEW MATERIAL plaque cycle and on P40 with nothing spilled, clipped
 * or over budget. The 0 to 1e300 money sweep and the level sweep are `desktopShell.spec.ts`'s
 * (ticket 767) and the long-mode hover `desktopInput.spec.ts`'s (ticket 768). Computed styles and
 * geometry through the DOM and `steampunkDebug`, never pixels.
 */
import { readFileSync } from 'node:fs'
import { expect, test, type Page } from '@playwright/test'
import type { ScriptedCommand } from '../../../src/systems/fastForward'
import { SHEET_UI_IDS } from '../../../src/ui/sheet/sheetIds'
import { UI_IDS } from '../../../src/ui/ids'
import { openGame, SLACK_PX, type HudLayoutCell } from '../hud/hudLayoutHelpers'
import {
  hudFindingsOf,
  NO_HUD_FINDINGS,
  NO_SHEET_FINDINGS,
  sheetFindingsOf,
} from './uiShotFindings'
import { openBaseSheet, UI_SHEETS, undock } from './uiShotSheets'

/** Software WebGL on a loaded box is slow; this is a wait, not a judgement. */
const TEST_TIMEOUT_MS = 240_000
const PLANET_1_START = readFileSync(
  new URL('../../../scenarios/planet1-start.scenario.json', import.meta.url),
  'utf8',
)
/** Seed 83921's first surface ore tile of planet 1 (`surfaceOreTiles`), as `miningPopup.spec.ts`. */
const FIRST_ORE = { tx: 12, ty: 298 }
const DRILL_TICKS = 40
/** Far enough ahead that the page clock has not passed it when the pause lands. */
const HOLD_AFTER_MS = 2000
/** Long enough for the HUD to render the batch and the overlay to place the plaque. */
const DRAW_FRAMES_MS = 250
/** The tier-0 plaque's 3.35 s, with room for software WebGL's slow frames on a busy box. */
const CLEARS_WITHIN_MS = 60_000
const PLAQUE = 'mining-popup-plaque'
const P40 = 40
const STRIP = '[data-hud="strip"]'
const CLUSTER = `[data-testid="${UI_IDS.hudDials}"]`
const SHEET = `[data-testid="${SHEET_UI_IDS.baseSheet}"]`
const BASE_SHEET = UI_SHEETS.find((row) => row.shot === 'base-sheet')!

const PLAIN = { isTvMode: false, floor: null } as const
const DESKTOP_CELLS: readonly HudLayoutCell[] = [
  { name: 'desktop-1280x800', viewport: { width: 1280, height: 800 }, isTouch: false, ...PLAIN },
  { name: 'desktop-1920x1080', viewport: { width: 1920, height: 1080 }, isTouch: false, ...PLAIN },
]
const PHONE_CELL: HudLayoutCell = {
  name: 'phone-360x640',
  viewport: { width: 360, height: 640 },
  isTouch: true,
  ...PLAIN,
}

interface DrawnFrame {
  source: string
  repeat: string
  width: string
}

for (const cell of DESKTOP_CELLS) {
  test.describe(`desktop brass art (ticket 770): ${cell.name}`, () => {
    test.use({ viewport: cell.viewport, isMobile: false, hasTouch: false, deviceScaleFactor: 1 })

    test('wraps the gauge cluster and the docked sheet in their rail frames, rivets repeated', async ({
      page,
    }) => {
      test.setTimeout(TEST_TIMEOUT_MS)
      const errors = await openPlainGame(page, cell)
      await undock(page)
      const cluster = await frameOf(page, CLUSTER)
      expect(cluster.source).toContain('ui-frame-cluster/')
      expect(cluster.repeat).toBe('round')
      expect(cluster.width).toBe('10px 24px')
      await openBaseSheet(page)
      await expect(page.locator(SHEET)).toHaveAttribute('data-placement', 'docked')
      const sheet = await frameOf(page, SHEET)
      expect(sheet.source).toContain('ui-frame-dock/')
      expect(sheet.repeat).toBe('round')
      expect(await sheetFindingsOf(page, BASE_SHEET)).toEqual(NO_SHEET_FINDINGS)
      expect(errors).toEqual([])
    })

    test('holds the strip and the docked sheet through the NEW MATERIAL plaque cycle', async ({
      page,
    }) => {
      test.setTimeout(TEST_TIMEOUT_MS)
      await page.clock.install()
      const errors = await openStartScenario(page, cell)
      await openBaseSheet(page)
      const strip = await boxOf(page, STRIP)
      await holdTime(page)
      await drillFromAbove(page, FIRST_ORE)
      await page.clock.runFor(DRAW_FRAMES_MS)
      await expect(page.getByTestId(PLAQUE)).toHaveCount(1)
      await expectStripHeld(page, strip)
      expect(await hudFindingsOf(page)).toEqual(NO_HUD_FINDINGS)
      expect(await sheetFindingsOf(page, BASE_SHEET)).toEqual(NO_SHEET_FINDINGS)
      await page.clock.resume()
      await expect(page.getByTestId(PLAQUE)).toHaveCount(0, { timeout: CLEARS_WITHIN_MS })
      await expectStripHeld(page, strip)
      expect(errors).toEqual([])
    })

    test('fits the strip and the docked sheet on P40', async ({ page }) => {
      test.setTimeout(TEST_TIMEOUT_MS)
      const errors = await openPlainGame(page, cell)
      await undock(page)
      await runDebug(page, [
        ['setPlanet', P40],
        ['giveMoney', '1e40'],
      ])
      await openBaseSheet(page)
      const strip = await boxOf(page, STRIP)
      await expectStripHeld(page, strip)
      expect(await hudFindingsOf(page)).toEqual(NO_HUD_FINDINGS)
      expect(await sheetFindingsOf(page, BASE_SHEET)).toEqual(NO_SHEET_FINDINGS)
      expect(errors).toEqual([])
    })
  })
}

test.describe(`desktop brass art (ticket 770): ${PHONE_CELL.name} keeps its own frames`, () => {
  test.use({ viewport: PHONE_CELL.viewport, isMobile: true, hasTouch: true, deviceScaleFactor: 1 })

  test('draws the glass frame on the cluster and the sheet frame on the full sheet, as before', async ({
    page,
  }) => {
    test.setTimeout(TEST_TIMEOUT_MS)
    const errors = await openPlainGame(page, PHONE_CELL)
    await page.touchscreen.tap(PHONE_CELL.viewport.width / 2, PHONE_CELL.viewport.height / 2)
    await undock(page)
    const cluster = await frameOf(page, CLUSTER)
    expect(cluster.source).toContain('ui-frame-glass/')
    expect(cluster.repeat).toBe('stretch')
    expect(cluster.width).toBe('6px')
    await openBaseSheet(page)
    await expect(page.locator(SHEET)).toHaveAttribute('data-placement', 'full')
    const sheet = await frameOf(page, SHEET)
    expect(sheet.source).toContain('ui-frame-sheet/')
    expect(sheet.repeat).toBe('stretch')
    expect(errors).toEqual([])
  })
})

type DebugCall = readonly ['giveMoney', string] | readonly ['setPlanet', number]

async function runDebug(page: Page, calls: readonly DebugCall[]): Promise<void> {
  await page.evaluate((list) => {
    const debug = window.steampunkDebug! as unknown as Record<
      string,
      (...values: unknown[]) => { ok: boolean; problems?: string[] }
    >
    for (const [name, ...values] of list) {
      const result = debug[name](...values)
      if (!result.ok) throw new Error(`${name}: ${(result.problems ?? []).join('; ')}`)
    }
  }, calls)
}

/** The frame an element draws: its border image's source, how its edges repeat and its width. */
async function frameOf(page: Page, selector: string): Promise<DrawnFrame> {
  return page
    .locator(selector)
    .first()
    .evaluate((element) => {
      const style = getComputedStyle(element)
      return {
        source: style.borderImageSource,
        repeat: style.borderImageRepeat,
        width: style.borderImageWidth,
      }
    })
}

/** The strip keeps its box and nothing on it runs past it: no reflow, no clipping. */
async function expectStripHeld(
  page: Page,
  before: { x: number; width: number; height: number },
): Promise<void> {
  const now = await boxOf(page, STRIP)
  expect(Math.abs(now.width - before.width)).toBeLessThanOrEqual(SLACK_PX)
  expect(Math.abs(now.height - before.height)).toBeLessThanOrEqual(SLACK_PX)
  const { scroll, client } = await page.locator(STRIP).evaluate((element) => ({
    scroll: element.scrollWidth,
    client: element.clientWidth,
  }))
  expect(scroll).toBeLessThanOrEqual(client)
}

/** The debug build with the opening transmission taken down. */
async function openPlainGame(page: Page, cell: HudLayoutCell): Promise<string[]> {
  const errors = await openGame(page, cell)
  await page.keyboard.press('KeyK')
  return errors
}

/** The committed planet 1 start scenario, enemies frozen, as `openGame` opens the plain build. */
async function openStartScenario(page: Page, cell: HudLayoutCell): Promise<string[]> {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(String(error)))
  await page.goto(`/?debug&scenario=${encodeURIComponent(PLANET_1_START)}`)
  await page.waitForFunction(() => window.steampunkDebug !== undefined)
  await page.evaluate((isTvMode) => {
    const debug = window.steampunkDebug!
    debug.freezeEnemies(true)
    debug.ui.setPref('tvMode', isTvMode)
  }, cell.isTvMode)
  await expect
    .poll(() => page.evaluate(() => document.documentElement.dataset.hudDensity ?? ''))
    .not.toBe('')
  await page.keyboard.press('KeyK')
  return errors
}

/**
 * Upright over the tile facing down, then the drill on it until it breaks (`miningPopup.spec.ts`);
 * the sheet helper undocked the rig already.
 */
async function drillFromAbove(page: Page, tile: { tx: number; ty: number }): Promise<void> {
  await page.evaluate(
    ({ target, drillTicks }) => {
      const debug = window.steampunkDebug!
      const snapshot = debug.snapshot()
      if (!snapshot.ok) throw new Error(snapshot.problems.join('; '))
      const tick = snapshot.snapshot.tick + 1
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
      const commands: ScriptedCommand[] = [
        { tick, type: 'reportPose', payload: pose },
        { tick: tick + drillTicks, type: 'drillTile', payload: { ...target, ticks: drillTicks } },
      ]
      const result = debug.fastForward(drillTicks + 1, commands)
      if (!result.ok) throw new Error(result.problems.join('; '))
    },
    { target: tile, drillTicks: DRILL_TICKS },
  )
}

/** Stops the page's clock, so the plaque only moves when the spec says (`miningPopup.spec.ts`). */
async function holdTime(page: Page): Promise<void> {
  const now = await page.evaluate(() => Date.now())
  await page.clock.pauseAt(now + HOLD_AFTER_MS)
}

async function boxOf(page: Page, selector: string) {
  const box = await page.locator(selector).first().boundingBox()
  if (box === null) throw new Error(`${selector} is not on screen`)
  return box
}
