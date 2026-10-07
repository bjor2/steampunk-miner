/**
 * The mining popup (#178, spec #172) in the preview build: read through the slice's debug read
 * and the DOM's test ids, never pixels. Drilling the first surface ore of the committed start
 * scenario shows its chip and the NEW MATERIAL plaque, a second tile of the type shows no second
 * plaque, and both clear on the game's own clock with no input. The page's clock is held while
 * the DOM is read, so a busy box never outlives a 1.4 s chip between two checks.
 */
import { readFileSync } from 'node:fs'
import { expect, test, type Page } from '@playwright/test'
import type { DebugApi } from '../../src/debug/debugApi'
import type { ScriptedCommand } from '../../src/systems/fastForward'

declare global {
  interface Window {
    steampunkDebug?: DebugApi
  }
}

interface PopupShown {
  tick: number
  chips: { oreId: string; count: number }[]
  plaque: { oreIds: string[]; phase: string } | null
  plaquesShown: number
}

const PLANET_1_START = readFileSync(
  new URL('../../scenarios/planet1-start.scenario.json', import.meta.url),
  'utf8',
)
/** Seed 83921's first two surface ore tiles of planet 1 (`surfaceOreTiles`), both metal tier 1. */
const FIRST_ORE = { tx: 12, ty: 298 }
const SAME_TYPE_ORE = { tx: 30, ty: 293 }
/** Past the first plaque's 3.35 s, so a second plaque would be a new one. */
const PLAQUE_GONE_TICKS = 400
const FIRST_ORE_ID = 'kernel.metal.t1'
const DRILL_TICKS = 40
/** Far enough ahead that the clock has not passed it by the time the pause lands. */
const HOLD_AFTER_MS = 500
/** Long enough for the HUD to render the batch and the overlay to place the chip. */
const DRAW_FRAMES_MS = 250
/** The tier-0 plaque's 3.35 s, with room for software WebGL's slow frames. */
const CLEARS_WITHIN_MS = 20_000

async function openStartScenario(page: Page): Promise<string[]> {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(String(error)))
  await page.goto(`/?debug&scenario=${encodeURIComponent(PLANET_1_START)}`)
  await page.waitForFunction(() => window.steampunkDebug !== undefined)
  return errors
}

/** Undocked, upright over the tile facing down, then the drill on it until it breaks. */
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
      }
      const commands: ScriptedCommand[] = [
        { tick, type: 'undock', payload: {} },
        { tick, type: 'reportPose', payload: pose },
        { tick: tick + drillTicks, type: 'drillTile', payload: { ...target, ticks: drillTicks } },
      ]
      const result = debug.fastForward(drillTicks + 1, commands)
      if (!result.ok) throw new Error(result.problems.join('; '))
    },
    { target: tile, drillTicks: DRILL_TICKS },
  )
}

/**
 * Stops the page's clock a few frames on, so the game, its tick and the popup hold still while
 * the DOM is read: a chip lives 1.4 s, less than a busy box takes between two checks.
 */
async function holdTime(page: Page): Promise<void> {
  const now = await page.evaluate(() => Date.now())
  await page.clock.pauseAt(now + HOLD_AFTER_MS)
  await page.clock.runFor(DRAW_FRAMES_MS)
}

function popupShown(page: Page): Promise<PopupShown> {
  return page.evaluate(() => {
    const result = window.steampunkDebug!.features['mining-popup'].getShown()
    if (!result.ok) throw new Error(result.problems.join('; '))
    return result as unknown as PopupShown
  })
}

test.describe('mining popup (#178)', () => {
  test('shows a chip and one self-clearing NEW MATERIAL plaque on the first mine', async ({
    page,
  }) => {
    await page.clock.install()
    const errors = await openStartScenario(page)
    await drillFromAbove(page, FIRST_ORE)
    await holdTime(page)
    const shown = await popupShown(page)
    expect(shown.chips).toEqual([expect.objectContaining({ oreId: FIRST_ORE_ID, count: 1 })])
    expect(shown.plaque?.oreIds).toEqual([FIRST_ORE_ID])
    await expect(page.getByTestId('mining-popup-plaque')).toHaveCount(1)
    await expect(page.getByTestId('mining-popup-chip')).toHaveCount(1)
    await page.clock.resume()
    await expect(page.getByTestId('mining-popup-plaque')).toHaveCount(0, {
      timeout: CLEARS_WITHIN_MS,
    })
    await expect(page.getByTestId('mining-popup-chip')).toHaveCount(0)
    expect(errors).toEqual([])
  })

  test('never shows a second plaque for a type already mined', async ({ page }) => {
    await openStartScenario(page)
    await drillFromAbove(page, FIRST_ORE)
    await page.evaluate((ticks) => window.steampunkDebug!.fastForward(ticks), PLAQUE_GONE_TICKS)
    await drillFromAbove(page, SAME_TYPE_ORE)
    const shown = await popupShown(page)
    expect(shown.chips).toEqual([expect.objectContaining({ oreId: FIRST_ORE_ID, count: 1 })])
    expect([shown.plaque, shown.plaquesShown]).toEqual([null, 1])
  })
})
