/**
 * The tool slot bar (spec #678 HS kinds, ticket 691; the G&V, GD and Producer rulings on #691) at
 * 360x640 held upright and at 1280x800 and 1440x900: a player with no tools sees the touch
 * cluster's one row and no bar, only the gear; with every tool owned the bar's cells are 44 px or
 * more, no HUD or touch box overlaps another, none enters the middle band or the stick zone, the
 * bar stands a gap above the cluster on a phone, the drill head stays uncovered while a slot's
 * cooldown ring runs, the overflow cell pages the tray in place, and on desktop Digit8 fires the
 * bore gun in cell 8. Geometry and state through the DOM and `steampunkDebug` only, never pixels.
 */
import { expect, test, type Page } from '@playwright/test'
import { middleBandOf, stickZoneOf } from '../../../src/systems/views/hudCoverageBudget'
import type { ScreenBox } from '../../../src/systems/views/hudClearView'
import {
  hudBoxes,
  openGame,
  overlappingPairs,
  vehicleBox,
  type HudLayoutCell,
  type MeasuredBox,
} from './hudLayoutHelpers'

declare global {
  interface Window {
    steampunkRunLog?: () => string
  }
}

interface BarCell extends HudLayoutCell {
  layout: 'phone' | 'desktop'
}

const CELLS: readonly BarCell[] = [
  {
    name: 'phone 360x640',
    viewport: { width: 360, height: 640 },
    isTouch: true,
    isTvMode: false,
    floor: null,
    layout: 'phone',
  },
  {
    name: 'desktop 1280x800',
    viewport: { width: 1280, height: 800 },
    isTouch: false,
    isTvMode: false,
    floor: null,
    layout: 'desktop',
  },
  {
    name: 'desktop 1440x900',
    viewport: { width: 1440, height: 900 },
    isTouch: false,
    isTvMode: false,
    floor: null,
    layout: 'desktop',
  },
]

const TOOL_BAR = 'hud-tool-slots'
const OVERFLOW = 'hud-tool-overflow'
/** The GD's done-when on #691: every target at least 44 px, 8 px between the bar and the cluster. */
const TARGET_PX = 44
const BAR_CLUSTER_GAP_PX = 8
/** The cluster's one row: Interact's 72 px (`constants/touch.ts`). */
const CLUSTER_ROW_PX = 72
const SLACK_PX = 1
/** Software WebGL on a loaded box is slow; this is a wait, not a judgement. */
const TEST_TIMEOUT_MS = 180_000
/** Five slotted power-ups, the cradles for slots 3-5, the guns, a charge rack and the bore gun. */
const STACKED_SLOTS = {
  'powerup.1': 'power.steam_shield',
  'powerup.2': 'power.grav_anchor',
  'powerup.3': 'power.ore_shifter',
  'powerup.4': 'consumable.lodestone_beacon',
  'powerup.5': 'consumable.rivet_patch',
}
const CRADLE_IDS = ['slot.powerup_3', 'slot.powerup_4', 'slot.powerup_5']

for (const cell of CELLS) {
  test.describe(`tool slot bar (ticket 691): ${cell.name}`, () => {
    test.use({
      viewport: cell.viewport,
      isMobile: cell.isTouch,
      hasTouch: cell.isTouch,
      deviceScaleFactor: 1,
    })

    test('shows no bar and no tool cell to a player with no tools, only the gear', async ({
      page,
    }) => {
      test.setTimeout(TEST_TIMEOUT_MS)
      const errors = await openBar(page, cell)
      await expect(page.getByTestId('hud-gear')).toBeVisible()
      await expect(page.getByTestId(TOOL_BAR)).toHaveCount(0)
      await expect(page.locator('[data-hud="tool-slot"]')).toHaveCount(0)
      if (cell.isTouch) {
        const cluster = await boxOf(page, 'touch-cluster')
        expect(Math.abs(cluster.bottom - cluster.top - CLUSTER_ROW_PX)).toBeLessThanOrEqual(
          SLACK_PX,
        )
        await expect(page.getByTestId('touch-plant_charge')).toHaveCount(0)
      }
      expect(errors).toEqual([])
    })

    test('keeps every cell a 44 px target, no box over another, out of the band and the stick zone', async ({
      page,
    }) => {
      test.setTimeout(TEST_TIMEOUT_MS)
      const errors = await openBar(page, cell)
      await stackEveryTool(page)
      const cells = (await hudBoxes(page)).filter(isBarBox)
      expect(cells.length).toBeGreaterThan(1)
      for (const each of cells) {
        expect(
          Math.min(each.right - each.left, each.bottom - each.top),
          each.testId ?? '',
        ).toBeGreaterThanOrEqual(TARGET_PX - SLACK_PX)
      }
      expect(await overlappingPairs(page)).toEqual([])
      const band = middleBandOf(cell.viewport)
      expect(cells.filter((each) => overlaps(each, band)).map(nameOf)).toEqual([])
      if (cell.isTouch) {
        const zone = stickZoneOf(cell.viewport)
        expect(cells.filter((each) => overlaps(each, zone)).map(nameOf)).toEqual([])
        const bar = await boxOf(page, TOOL_BAR)
        const cluster = await boxOf(page, 'touch-cluster')
        expect(cluster.top - bar.bottom).toBeGreaterThanOrEqual(BAR_CLUSTER_GAP_PX - SLACK_PX)
      }
      expect(errors).toEqual([])
    })

    test('keeps the drill head uncovered while a slot cooldown ring runs', async ({ page }) => {
      test.setTimeout(TEST_TIMEOUT_MS)
      const errors = await openBar(page, cell)
      await stackEveryTool(page)
      await pressSlotOne(page, cell)
      const slotOne = '[data-testid="power-up-slot-powerup.1"]'
      await expect(
        page.locator(`${slotOne}:is([data-cooling], [data-acting], [data-on])`),
      ).toBeVisible()
      const vehicle = await vehicleBox(page)
      const covering = (await hudBoxes(page)).filter((box) => overlaps(box, vehicle))
      expect(covering.map(nameOf)).toEqual([])
      expect(errors).toEqual([])
    })

    test('pages the tools past the slot cells through the overflow cell and back', async ({
      page,
    }) => {
      test.setTimeout(TEST_TIMEOUT_MS)
      const errors = await openBar(page, cell)
      await stackEveryTool(page)
      // Phone: slots 1-4 first, slot 5 waits; desktop: Plant charge (position 9) waits.
      const waiting = page.getByTestId(
        cell.layout === 'phone' ? 'power-up-slot-powerup.5' : 'touch-plant_charge',
      )
      await expect(waiting).toHaveCount(0)
      await tapOrClick(page, cell, OVERFLOW)
      await expect(waiting).toBeVisible()
      await expect(page.getByTestId('power-up-slot-powerup.1')).toHaveCount(0)
      while ((await page.getByTestId('power-up-slot-powerup.1').count()) === 0) {
        await tapOrClick(page, cell, OVERFLOW)
      }
      await expect(waiting).toHaveCount(0)
      expect(errors).toEqual([])
    })

    if (cell.layout === 'desktop') {
      test('fires the bore gun in cell 8 with Digit8', async ({ page }) => {
        test.setTimeout(TEST_TIMEOUT_MS)
        const errors = await openBar(page, cell)
        await stackEveryTool(page)
        const cells = await page.getByTestId(TOOL_BAR).locator('[data-hud="tool-slot"]').all()
        const testIds = await Promise.all(cells.map((each) => each.getAttribute('data-testid')))
        expect(testIds).toContain('ground-gun-fire-tile')
        await page.keyboard.press('Digit8')
        await expect.poll(() => boreShotsLogged(page)).toBe(1)
        expect(errors).toEqual([])
      })
    }
  })
}

/** The game open, the opening transmission down by a key and, on touch, the controls up. */
async function openBar(page: Page, cell: BarCell): Promise<string[]> {
  const errors = await openGame(page, cell)
  await page.keyboard.press('KeyH')
  if (cell.isTouch) {
    await page.touchscreen.tap(cell.viewport.width / 2, cell.viewport.height * 0.2)
    await expect(page.getByTestId('touch-controls')).toBeVisible()
  }
  return errors
}

async function stackEveryTool(page: Page): Promise<void> {
  const problems = await page.evaluate(
    ({ slots, cradles }) => {
      const debug = window.steampunkDebug!
      return [
        debug.setGunLevel(10),
        debug.setCharges(2, 1),
        debug.setVehicleLoadout(slots, cradles),
        debug.features['ground-gun'].setLevels(1, 1, 1),
      ].flatMap((result) => (result.ok ? [] : result.problems))
    },
    { slots: STACKED_SLOTS, cradles: CRADLE_IDS },
  )
  expect(problems).toEqual([])
  await expect(page.getByTestId(TOOL_BAR)).toBeVisible()
  await expect(page.getByTestId(OVERFLOW)).toBeVisible()
}

/** Slot 1 used as Digit1 or a tap uses it: the steam shield acts, then its cooldown ring runs. */
async function pressSlotOne(page: Page, cell: BarCell): Promise<void> {
  if (cell.isTouch) await page.getByTestId('power-up-slot-powerup.1').tap()
  else await page.keyboard.press('Digit1')
}

async function tapOrClick(page: Page, cell: BarCell, testId: string): Promise<void> {
  const target = page.getByTestId(testId)
  if (cell.isTouch) await target.tap()
  else await target.click()
}

function boreShotsLogged(page: Page): Promise<number> {
  return page.evaluate(
    () => (window.steampunkRunLog?.() ?? '').split('"event":"bore_fired"').length - 1,
  )
}

function boxOf(page: Page, testId: string): Promise<ScreenBox> {
  return page
    .getByTestId(testId)
    .evaluate((element) => element.getBoundingClientRect().toJSON() as ScreenBox)
}

function isBarBox(box: MeasuredBox): boolean {
  return box.id === 'tool-slot' || box.id === 'gear'
}

function nameOf(box: MeasuredBox): string {
  return `${box.id}:${box.testId ?? ''}`
}

function overlaps(a: ScreenBox, b: ScreenBox): boolean {
  return (
    a.left + SLACK_PX < b.right &&
    b.left + SLACK_PX < a.right &&
    a.top + SLACK_PX < b.bottom &&
    b.top + SLACK_PX < a.bottom
  )
}
