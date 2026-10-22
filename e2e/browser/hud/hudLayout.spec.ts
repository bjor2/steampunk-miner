/**
 * The compact HUD (#500, spec #470; the GD's numbers 6215096674 and rulings 6215849308): on every
 * phone cell, held either way up, the worst case (drilling, a full hold, the cargo hint, a threat
 * marker, the Tech tree button) keeps every `data-hud` box apart, every text inside its box, the
 * vehicle's body uncovered, the hint chip one line within 8% of the height with a 48 px dismiss,
 * and the Tech tree button 48 px or more, out of the stick zone and the cluster. The clear view is
 * asserted on the four reference phones (70% upright, 65% sideways), in the worst case and with
 * every control owned and three status chips (#486 closed that gap), and logged on the small-phone
 * sweep, where a one-way ratchet waits for a number. With every control owned every pair is
 * asserted either way up: the slots and the fire tile left #485's tile lane for the tool slot bar
 * (ticket 691), whose cells are HUD boxes in the thumb corner.
 * The desktop, TV and tablet cells keep the full HUD: the strip centred on top (ticket 684). A cell that cannot reach the worst case
 * fails, never skips. Geometry through the DOM and `steampunkDebug` only.
 */
import { expect, test, type Page } from '@playwright/test'
import { clearShareOf } from '../../../src/systems/views/hudClearView'
import { hintChipHeightOf } from '../../../src/systems/views/hintRoom'
import {
  boxOfTestId,
  hudBoxes,
  isInside,
  openGame,
  overlappingPairs,
  reachWorstCase,
  showCargoHint,
  spilledTexts,
  stackEveryControl,
  stickZone,
  vehicleBox,
  type HudLayoutCell,
} from './hudLayoutHelpers'

/** The four reference phones (#484's cells) and the small-phone sweep (GD ruling 3). */
const PHONE_CELLS: readonly HudLayoutCell[] = [
  {
    name: 'phone-portrait',
    viewport: { width: 390, height: 844 },
    isTouch: true,
    isTvMode: false,
    floor: 0.7,
  },
  {
    name: 'pixel-portrait',
    viewport: { width: 412, height: 915 },
    isTouch: true,
    isTvMode: false,
    floor: 0.7,
  },
  {
    name: 'phone-landscape',
    viewport: { width: 844, height: 390 },
    isTouch: true,
    isTvMode: false,
    floor: 0.65,
  },
  {
    name: 'pixel-landscape',
    viewport: { width: 915, height: 412 },
    isTouch: true,
    isTvMode: false,
    floor: 0.65,
  },
  {
    name: 'sweep-360x640',
    viewport: { width: 360, height: 640 },
    isTouch: true,
    isTvMode: false,
    floor: null,
  },
  {
    name: 'sweep-320x568',
    viewport: { width: 320, height: 568 },
    isTouch: true,
    isTvMode: false,
    floor: null,
  },
  {
    name: 'sweep-640x360',
    viewport: { width: 640, height: 360 },
    isTouch: true,
    isTvMode: false,
    floor: null,
  },
]

/** Desktop, TV and tablets keep the full HUD; 1280x720 with a mouse is the GD's guard cell. */
const FULL_CELLS: readonly HudLayoutCell[] = [
  {
    name: 'desktop-720',
    viewport: { width: 1280, height: 720 },
    isTouch: false,
    isTvMode: false,
    floor: null,
  },
  {
    name: 'desktop',
    viewport: { width: 1920, height: 1080 },
    isTouch: false,
    isTvMode: false,
    floor: null,
  },
  {
    name: 'ultra-wide',
    viewport: { width: 2560, height: 1080 },
    isTouch: false,
    isTvMode: false,
    floor: null,
  },
  {
    name: 'tv-1080p',
    viewport: { width: 1920, height: 1080 },
    isTouch: false,
    isTvMode: true,
    floor: null,
  },
  {
    name: 'tablet',
    viewport: { width: 1180, height: 820 },
    isTouch: true,
    isTvMode: false,
    floor: null,
  },
  {
    name: 'tablet-portrait',
    viewport: { width: 820, height: 1180 },
    isTouch: true,
    isTvMode: false,
    floor: null,
  },
]

/** The touch targets #470 asks for; the measured box, never the CSS (GD). */
const TARGET_PX = 48
/** Samples of the drilling run, a quarter second apart. */
const DRILL_SAMPLES = 12
const SAMPLE_GAP_MS = 250
/** Software WebGL on a loaded box is slow; these are waits, not judgements. */
const TEST_TIMEOUT_MS = 300_000

for (const cell of PHONE_CELLS) {
  test.describe(`mobile HUD declutter (#500): ${cell.name}`, () => {
    test.use({
      viewport: cell.viewport,
      isMobile: true,
      hasTouch: true,
      deviceScaleFactor: 1,
    })

    test('reaches the worst case and keeps every data-hud box apart, text inside, the vehicle uncovered', async ({
      page,
    }) => {
      test.setTimeout(TEST_TIMEOUT_MS)
      const errors = await openGame(page, cell)
      expect(await densityOf(page)).toBe('compact')
      await reachWorstCase(page, cell)
      for (let sample = 0; sample < DRILL_SAMPLES; sample++) {
        expect(await overlappingPairs(page), `sample ${sample}`).toEqual([])
        await expectVehicleUncovered(page)
        await page.waitForTimeout(SAMPLE_GAP_MS)
      }
      expect(await spilledTexts(page)).toEqual([])
      expect(errors).toEqual([])
    })

    test('keeps the hint chip one line within 8% of the height, with a 48 px dismiss that takes it down', async ({
      page,
    }) => {
      test.setTimeout(TEST_TIMEOUT_MS)
      await openGame(page, cell)
      await reachWorstCase(page, cell)
      const chip = page.locator('[data-hud="hint"]')
      if (cell.floor !== null) await expect(chip, 'the worst case shows the hint').toHaveCount(1)
      if ((await chip.count()) === 0) return logShare(page, cell, 'hint queued for room')
      const box = await chip.evaluate((element) => element.getBoundingClientRect().toJSON())
      expect(box.height).toBeLessThanOrEqual(0.08 * cell.viewport.height + 0.5)
      expect(box.height).toBeLessThanOrEqual(hintChipHeightOf(cell.viewport) + 0.5)
      const dismiss = await boxOfTestId(page, 'hud-hint-dismiss')
      expect(dismiss.right - dismiss.left).toBeGreaterThanOrEqual(TARGET_PX)
      expect(dismiss.bottom - dismiss.top).toBeGreaterThanOrEqual(TARGET_PX)
      const zone = await stickZone(page)
      if (zone !== null) expect(overlapsBox(dismiss, zone)).toBe(false)
      const controls = (await hudBoxes(page)).filter((each) => each.id === 'control')
      expect(controls.filter((control) => overlapsBox(dismiss, control))).toEqual([])
      await page.getByTestId('hud-hint-dismiss').tap()
      await expect(chip).toHaveCount(0)
      await expect(page.getByTestId('touch-interact')).toBeVisible()
    })

    test('keeps the Tech tree button at 48 px or more and outside the stick zone and cluster', async ({
      page,
    }) => {
      test.setTimeout(TEST_TIMEOUT_MS)
      await openGame(page, cell)
      await reachWorstCase(page, cell)
      const tree = await boxOfTestId(page, 'tech-tree-open')
      expect(tree.right - tree.left).toBeGreaterThanOrEqual(TARGET_PX)
      expect(tree.bottom - tree.top).toBeGreaterThanOrEqual(TARGET_PX)
      const zone = await stickZone(page)
      expect(zone).not.toBeNull()
      expect(overlapsBox(tree, zone!)).toBe(false)
      const controls = (await hudBoxes(page)).filter((box) => box.id === 'control')
      expect(controls.filter((control) => overlapsBox(tree, control))).toEqual([])
      const kept = (await hudBoxes(page)).filter((box) => box.id !== 'control')
      expect(kept.filter((box) => overlapsBox(box, zone!)).map((box) => box.id)).toEqual([])
    })

    test('keeps every data-hud box inside the safe area', async ({ page }) => {
      test.setTimeout(TEST_TIMEOUT_MS)
      await openGame(page, cell)
      await reachWorstCase(page, cell)
      const safe = await boxOfTestId(page, 'safe-area')
      const outside = (await hudBoxes(page)).filter((box) => !isInside(box, safe))
      expect(outside.map((box) => box.id)).toEqual([])
    })

    test(
      cell.floor === null
        ? 'logs the clear-view share on the small-phone sweep'
        : `keeps at least ${cell.floor * 100}% of the view clear`,
      async ({ page }) => {
        test.setTimeout(TEST_TIMEOUT_MS)
        await openGame(page, cell)
        await reachWorstCase(page, cell)
        const share = await logShare(page, cell, 'worst case, early loadout')
        if (cell.floor !== null) expect(share).toBeGreaterThanOrEqual(cell.floor)
      },
    )

    // GD ruling 2 on #500: the stacked case's gap is #486's, asserted once it closed (#486).
    test(
      cell.floor === null
        ? 'logs the clear-view share with every control owned, three status chips and the hint'
        : `keeps ${cell.floor * 100}% clear with every control owned, three status chips and the hint`,
      async ({ page }) => {
        test.setTimeout(TEST_TIMEOUT_MS)
        await openGame(page, cell)
        await reachWorstCase(page, cell)
        await stackEveryControl(page)
        await showCargoHint(page)
        await page.waitForTimeout(SAMPLE_GAP_MS * 2)
        expect(await overlappingPairs(page)).toEqual([])
        await expectVehicleUncovered(page)
        const share = await logShare(page, cell, 'every control owned')
        if (cell.floor !== null) expect(share).toBeGreaterThanOrEqual(cell.floor)
      },
    )
  })
}

for (const cell of FULL_CELLS) {
  test.describe(`mobile HUD declutter (#500): ${cell.name} keeps the full HUD`, () => {
    test.use({
      viewport: cell.viewport,
      isMobile: cell.isTouch,
      hasTouch: cell.isTouch,
      deviceScaleFactor: 1,
    })

    test('lays the strip centred under the top inset with no panel stack on the desktop, ultra-wide, tv and tablet cells', async ({
      page,
    }) => {
      test.setTimeout(TEST_TIMEOUT_MS)
      const errors = await openGame(page, cell)
      expect(await densityOf(page)).toBe('full')
      const safe = await boxOfTestId(page, 'safe-area')
      const byId = new Map((await hudBoxes(page)).map((box) => [box.id, box]))
      // Ticket 684: one strip at the top centre replaces the gauges, readouts and banner panels.
      const strip = byId.get('strip')!
      expect(Math.abs(strip.top - safe.top)).toBeLessThan(1)
      expect(Math.abs((strip.left + strip.right) / 2 - (safe.left + safe.right) / 2)).toBeLessThan(
        2,
      )
      expect(['gauges', 'readouts', 'status'].filter((id) => byId.has(id))).toEqual([])
      expect(byId.get('gear')!.top).toBeGreaterThanOrEqual(strip.bottom)
      expect(errors).toEqual([])
    })
  })
}

function densityOf(page: Page): Promise<string> {
  return page.evaluate(() => document.documentElement.dataset.hudDensity ?? '')
}

async function expectVehicleUncovered(page: Page): Promise<void> {
  const vehicle = await vehicleBox(page)
  const covering = (await hudBoxes(page)).filter((box) => overlapsBox(box, vehicle))
  expect(covering.map((box) => `${box.id}:${box.testId ?? ''}`)).toEqual([])
}

/** The clear share of the view now, written to the report beside the cell (GD ruling 3). */
async function logShare(page: Page, cell: HudLayoutCell, state: string): Promise<number> {
  const share = clearShareOf(await hudBoxes(page), cell.viewport)
  test.info().annotations.push({
    type: 'clear-view',
    description: `${cell.name} ${state}: ${(share * 100).toFixed(1)}% clear`,
  })
  return share
}

function overlapsBox(
  a: { left: number; top: number; right: number; bottom: number },
  b: { left: number; top: number; right: number; bottom: number },
): boolean {
  return (
    a.left + 0.5 < b.right &&
    b.left + 0.5 < a.right &&
    a.top + 0.5 < b.bottom &&
    b.top + 0.5 < a.bottom
  )
}
