/**
 * The portrait rows of the screen matrix (#470 PT-6, ticket 488) on the upright cells
 * (`phone-portrait`, `pixel-portrait`, `tablet-portrait`, sized by ticket 484): no
 * turn-your-device card, no two HUD boxes over each other, and every touch control inside the
 * safe area, off the other controls and off the HUD, as the game opens, all through a dig with
 * the simulation running, and docked at each bay. The per-feature rows held upright are their
 * tickets' own specs (framing 484, touch 485, HUD 486, panels 487); turning the device is
 * `rotation.spec.ts`. Geometry through the DOM and `steampunkDebug`, never pixels.
 */
import { expect, test, type Page } from '@playwright/test'
import {
  boxOf,
  currentCell,
  dockAt,
  layoutFindingsOf,
  NO_LAYOUT_FINDINGS,
  openGame,
  startDiggingDown,
} from './screenHelpers'

const DIG_SAMPLES = 6
const DIG_SAMPLE_GAP_MS = 1000
/** A rounding pixel in the browser's layout. */
const SLACK_PX = 1

test.beforeEach(() => {
  test.skip(!currentCell().isPortrait, 'these are the upright cells')
})

test.describe('screen matrix: held upright (ticket 488)', () => {
  test('opens over the whole window with no card, the HUD apart and every control in the safe area', async ({
    page,
  }) => {
    const cell = currentCell()
    const errors = await openGame(page, cell)
    const stage = await boxOf(page, 'game-stage')
    expect(stage.width).toBeCloseTo(cell.viewport.width, 0)
    expect(stage.height).toBeCloseTo(cell.viewport.height, 0)
    await expect(page.getByTestId('hud-state')).toBeVisible()
    expect(await layoutFindingsOf(page)).toEqual(NO_LAYOUT_FINDINGS)
    expect(errors).toEqual([])
  })

  test('keeps the HUD apart and every control in the safe area through a dig with the ticks advancing', async ({
    page,
  }) => {
    test.setTimeout(240_000)
    const errors = await openGame(page, currentCell())
    await startDiggingDown(page)
    const firstTick = await tickNow(page)
    for (let sample = 0; sample < DIG_SAMPLES; sample++) {
      await page.waitForTimeout(DIG_SAMPLE_GAP_MS)
      expect(await layoutFindingsOf(page), `sample ${sample}`).toEqual(NO_LAYOUT_FINDINGS)
    }
    expect(await tickNow(page)).toBeGreaterThan(firstTick)
    await page.evaluate(() => window.steampunkDebug!.input.release('aim_down'))
    expect(errors).toEqual([])
  })

  test('keeps the HUD apart and every control in the safe area docked at each bay', async ({
    page,
  }) => {
    test.setTimeout(180_000)
    const errors = await openGame(page, currentCell())
    for (const bay of ['sell', 'upgrade'] as const) {
      await dockAt(page, bay)
      expect(await layoutFindingsOf(page), bay).toEqual(NO_LAYOUT_FINDINGS)
      await expectBayScreenInsideWindow(page)
    }
    expect(errors).toEqual([])
  })
})

async function expectBayScreenInsideWindow(page: Page): Promise<void> {
  const screen = await boxOf(page, 'platform-screen')
  const viewport = page.viewportSize()!
  expect(screen.left).toBeGreaterThanOrEqual(-SLACK_PX)
  expect(screen.top).toBeGreaterThanOrEqual(-SLACK_PX)
  expect(screen.right).toBeLessThanOrEqual(viewport.width + SLACK_PX)
  expect(screen.bottom).toBeLessThanOrEqual(viewport.height + SLACK_PX)
}

function tickNow(page: Page): Promise<number> {
  return page.evaluate(() => {
    const result = window.steampunkDebug!.snapshot()
    return result.ok ? result.snapshot.tick : -1
  })
}
