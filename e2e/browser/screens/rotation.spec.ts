/**
 * Rotation (#470 PT-1, ticket 483; it replaces #173's turn-your-device card spec): on every touch
 * screen the game plays either way up. Turning the device with the simulation running, with no
 * reload, lays the stage out again over the whole window, flips the root's `data-orientation`,
 * keeps the safe area inside the window, and the ticks keep advancing. No card covers portrait.
 * Turned mid-dig (#470 PT-6, ticket 488), the rig keeps digging down the same session each way up
 * and the matrix's layout rows hold: no card, the HUD apart, every control in the safe area. The
 * upright rows at rest are `portraitMatrix.spec.ts`.
 */
import { expect, test, type Page } from '@playwright/test'
import type { ScreenCell } from './screenCells'
import {
  boxOf,
  currentCell,
  layoutFindingsOf,
  NO_LAYOUT_FINDINGS,
  openGame,
  startDiggingDown,
} from './screenHelpers'

/** A rounding pixel in the browser's layout. */
const SLACK_PX = 1
/** Half a cell further down: the drill is still cutting, not resting on the face. */
const DUG_MM = 500

test.beforeEach(() => {
  test.skip(!currentCell().isTouch, 'only a phone or tablet is turned in the hand')
})

test.describe('screen matrix: rotation (ticket 483)', () => {
  test('lays the stage out again each way up with no reload and the ticks advancing', async ({
    page,
  }) => {
    test.setTimeout(180_000)
    const cell = currentCell()
    const errors = await openGame(page, cell)
    await page.evaluate(() => Object.assign(window, { rotationMarker: true }))
    await expectFittedTo(page, cell.viewport, cell.isPortrait)
    await expectTicksAdvancing(page)
    await page.setViewportSize(turned(cell.viewport))
    await expectFittedTo(page, turned(cell.viewport), !cell.isPortrait)
    await expectTicksAdvancing(page)
    await page.setViewportSize(cell.viewport)
    await expectFittedTo(page, cell.viewport, cell.isPortrait)
    await expectTicksAdvancing(page)
    expect(await page.evaluate(() => 'rotationMarker' in window)).toBe(true)
    expect(errors).toEqual([])
  })

  test('keeps the rig digging and the layout in place when turned mid-dig, with no reload (ticket 488)', async ({
    page,
  }) => {
    test.setTimeout(300_000)
    const cell = currentCell()
    const errors = await openGame(page, cell)
    await page.evaluate(() => Object.assign(window, { rotationMarker: true }))
    await startDiggingDown(page)
    for (const viewport of [turned(cell.viewport), cell.viewport]) {
      const before = await rigCentreDistanceMm(page)
      await page.setViewportSize(viewport)
      await expectFittedTo(page, viewport, viewport.height > viewport.width)
      await expect.poll(() => layoutFindingsOf(page)).toEqual(NO_LAYOUT_FINDINGS)
      await expect
        .poll(() => rigCentreDistanceMm(page), { timeout: 30_000 })
        .toBeLessThan(before - DUG_MM)
    }
    await page.evaluate(() => window.steampunkDebug!.input.release('aim_down'))
    expect(await page.evaluate(() => 'rotationMarker' in window)).toBe(true)
    expect(errors).toEqual([])
  })

  test('shows no turn-your-device card when held upright', async ({ page }) => {
    const cell = currentCell()
    const errors = await openGame(page, cell)
    if (!cell.isPortrait) await page.setViewportSize(turned(cell.viewport))
    await expect.poll(() => orientationOf(page)).toBe('portrait')
    await expect(page.getByTestId('portrait-card')).toHaveCount(0)
    await expect(page.getByTestId('hud-state')).toBeVisible()
    expect(errors).toEqual([])
  })
})

function turned(viewport: ScreenCell['viewport']): ScreenCell['viewport'] {
  return { width: viewport.height, height: viewport.width }
}

/** The root's orientation, the stage over the whole window, and the safe area inside it. */
async function expectFittedTo(
  page: Page,
  viewport: ScreenCell['viewport'],
  isPortrait: boolean,
): Promise<void> {
  await expect.poll(() => orientationOf(page)).toBe(isPortrait ? 'portrait' : 'landscape')
  await expect.poll(() => fittedOrientationOf(page)).toBe(isPortrait ? 'portrait' : 'landscape')
  await expect
    .poll(async () => (await boxOf(page, 'game-stage')).width)
    .toBeCloseTo(viewport.width, 0)
  const stage = await boxOf(page, 'game-stage')
  expect(stage.left).toBeCloseTo(0, 0)
  expect(stage.height).toBeCloseTo(viewport.height, 0)
  const safeArea = await boxOf(page, 'safe-area')
  expect(safeArea.left).toBeGreaterThanOrEqual(-SLACK_PX)
  expect(safeArea.top).toBeGreaterThanOrEqual(-SLACK_PX)
  expect(safeArea.right).toBeLessThanOrEqual(viewport.width + SLACK_PX)
  expect(safeArea.bottom).toBeLessThanOrEqual(viewport.height + SLACK_PX)
  // The canvas follows the stage once R3F has measured it again.
  await expect
    .poll(async () => (await page.locator('canvas').first().boundingBox())?.width)
    .toBeCloseTo(viewport.width, 0)
}

async function expectTicksAdvancing(page: Page): Promise<void> {
  const before = await tickNow(page)
  await expect.poll(() => tickNow(page), { timeout: 30_000 }).toBeGreaterThan(before)
}

function tickNow(page: Page): Promise<number> {
  return page.evaluate(() => {
    const result = window.steampunkDebug!.snapshot()
    return result.ok ? result.snapshot.tick : -1
  })
}

/** The rig's distance from the planet's centre (the origin), mm: falls as it digs down. */
function rigCentreDistanceMm(page: Page): Promise<number> {
  return page.evaluate(() => {
    const result = window.steampunkDebug!.snapshot()
    if (!result.ok) throw new Error(result.problems.join('; '))
    const [player] = Object.values(result.snapshot.state.players)
    const pose = player.vehicle.pose
    if (pose === null) throw new Error('the vehicle has no pose')
    return Math.hypot(pose.x, pose.y)
  })
}

function orientationOf(page: Page): Promise<string | null> {
  return page.evaluate(() => document.documentElement.getAttribute('data-orientation'))
}

function fittedOrientationOf(page: Page): Promise<string> {
  return page.evaluate(() => {
    const result = window.steampunkDebug!.ui.getScreenLayout()
    return result.ok ? result.layout.orientation : 'none'
  })
}
