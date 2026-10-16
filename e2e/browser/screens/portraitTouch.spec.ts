/**
 * The touch controls held upright (#470 PT-3, ticket 485) in the matrix's portrait cells: the
 * stick zone over the lower 45% of the height from the thumb's lower corner, ending at the bottom
 * inset; a phone's cluster in two rows in the other lower corner; the slot column and the fire
 * tile on the free edge above it; every control inside the safe area, apart, off the HUD and off
 * the vehicle with a stacked loadout; and the left-hand mirror of all of it. The stick's and the
 * keys' action streams, the pause button and the taps alone run upright in
 * `touchControls.spec.ts`. Geometry through the DOM and `steampunkDebug`, never pixels.
 */
import { expect, test, type Page } from '@playwright/test'
import { HUD_COMPACT_COARSE_SHORT_AXIS_PX } from '../../../src/constants/screen'
import {
  CLUSTER_BUTTON_PX,
  CLUSTER_GAP_PX,
  INTERACT_BUTTON_PX,
  STICK_ZONE_HEIGHT_PERCENT,
  STICK_ZONE_WIDTH_PERCENT,
  TOUCH_TILE_LANE_TOP_PERCENT,
} from '../../../src/constants/touch'
import type { ScreenCell } from './screenCells'
import {
  boxOf,
  currentCell,
  declaredHudBoxes,
  hudBoxesBesideControls,
  openGame,
  overlaps,
  shortAxisOf,
  type Box,
  type HudBox,
} from './screenHelpers'

const PERCENT = 100
/** A layout's rounding pixel. */
const SLACK_PX = 1
/** An iPhone's home bar held upright: `env(safe-area-inset-bottom)` is 34 px there. */
const HOME_BAR_PX = 34
/** The size badge's row on top of Interact's and the middle one, sideways and on a tablet. */
const BADGE_ROW_PX = 48
/** Five power-up slots, every cradle owned, so the column is as tall as it gets. */
const STACKED_SLOTS = {
  'powerup.1': 'power.steam_shield',
  'powerup.2': 'power.grav_anchor',
  'powerup.3': 'power.ore_shifter',
  'powerup.4': 'consumable.lodestone_beacon',
  'powerup.5': 'consumable.rivet_patch',
}
const CRADLE_IDS = ['slot.powerup_3', 'slot.powerup_4', 'slot.powerup_5']
const SLOT_TEST_ID_PREFIX = 'power-up-slot-'
const FIRE_TILE = 'ground-gun-fire-tile'

test.beforeEach(() => {
  const cell = currentCell()
  test.skip(!cell.isTouch || !cell.isPortrait, 'these are the upright touch screens')
})

test.describe('screen matrix: touch controls held upright (ticket 485)', () => {
  test('lays the stick zone over the lower 45% of the height, from the thumb corner to the bottom inset', async ({
    page,
  }) => {
    const cell = currentCell()
    const errors = await openGame(page, cell)
    expect(await densityOf(page)).toBe(expectedDensityOf(cell))
    const zone = await boxOf(page, 'touch-stick-zone')
    const safe = await boxOf(page, 'safe-area')
    expect(Math.abs(zone.top - zoneTopOf(cell))).toBeLessThanOrEqual(SLACK_PX)
    expect(Math.abs(zone.bottom - safe.bottom)).toBeLessThanOrEqual(SLACK_PX)
    expect(Math.abs(zone.left - safe.left)).toBeLessThanOrEqual(SLACK_PX)
    expect(zone.width).toBeLessThanOrEqual(zoneWidthMaxOf(cell))
    // A thumb on the zone covers the screen's lower left corner (the TD's risk table on #470).
    expect(isPointInside({ x: safe.left + 1, y: safe.bottom - 1 }, zone)).toBe(true)
    expect(errors).toEqual([])
  })

  test('ends the stick zone and the cluster above a home bar', async ({ page }) => {
    const cell = currentCell()
    const errors = await openGame(page, cell)
    // Chromium has no home bar to emulate, so the inset is set as env(safe-area-inset-bottom) would.
    await page.addStyleTag({ content: `:root { --safe-bottom: ${HOME_BAR_PX}px !important; }` })
    const homeBarTop = cell.viewport.height - HOME_BAR_PX
    await expect.poll(async () => (await boxOf(page, 'safe-area')).bottom).toBe(homeBarTop)
    const zone = await boxOf(page, 'touch-stick-zone')
    expect(zone.bottom).toBeLessThanOrEqual(homeBarTop + SLACK_PX)
    expect(Math.abs(zone.top - zoneTopOf(cell))).toBeLessThanOrEqual(SLACK_PX)
    expect((await boxOf(page, 'touch-cluster')).bottom).toBeLessThanOrEqual(homeBarTop + SLACK_PX)
    expect(errors).toEqual([])
  })

  test('keeps every HUD box out of the stick zone on a phone', async ({ page }) => {
    const cell = currentCell()
    test.skip(!isPhone(cell), 'a portrait tablet keeps the full HUD; its zone is logged below')
    const errors = await openGame(page, cell)
    await stackLoadout(page)
    const zone = await boxOf(page, 'touch-stick-zone')
    const inZone = (await hudBoxesBesideControls(page)).filter((box) => overlaps(box, zone))
    expect(inZone.map(nameOf)).toEqual([])
    expect(errors).toEqual([])
  })

  test('logs the full-HUD boxes the stick zone meets on a portrait tablet (#486 owns them)', async ({
    page,
  }) => {
    const cell = currentCell()
    test.skip(isPhone(cell), 'a phone asserts its zone clear above')
    await openGame(page, cell)
    await stackLoadout(page)
    const zone = await boxOf(page, 'touch-stick-zone')
    const inZone = (await hudBoxesBesideControls(page)).filter((box) => overlaps(box, zone))
    test.info().annotations.push({
      type: 'stick-zone',
      description: `${cell.name}: ${inZone.map(nameOf).join(', ') || 'no HUD box'} in the zone`,
    })
  })

  test('lays the cluster in the other lower corner, in two rows on a phone, a gap clear of the zone', async ({
    page,
  }) => {
    const cell = currentCell()
    const errors = await openGame(page, cell)
    await stackLoadout(page)
    const cluster = await boxOf(page, 'touch-cluster')
    const zone = await boxOf(page, 'touch-stick-zone')
    const safe = await boxOf(page, 'safe-area')
    expect(Math.abs(cluster.height - clusterHeightOf(cell))).toBeLessThanOrEqual(SLACK_PX)
    expect(cluster.left - zone.right).toBeGreaterThanOrEqual(CLUSTER_GAP_PX)
    expect(cluster.top).toBeGreaterThanOrEqual(zoneTopOf(cell) - SLACK_PX)
    expect(isInside(cluster, safe)).toBe(true)
    const interact = await boxOf(page, 'touch-interact')
    expect(Math.abs(interact.right - cluster.right)).toBeLessThanOrEqual(SLACK_PX)
    expect(Math.abs(interact.bottom - cluster.bottom)).toBeLessThanOrEqual(SLACK_PX)
    for (const id of ['touch-plant_charge', 'touch-toggle_guns']) {
      expect(isInside(await boxOf(page, id), cluster), id).toBe(true)
    }
    expect(errors).toEqual([])
  })

  test('keeps the slot column and the fire tile on the free edge above the cluster', async ({
    page,
  }) => {
    const cell = currentCell()
    const errors = await openGame(page, cell)
    await stackLoadout(page)
    const cluster = await boxOf(page, 'touch-cluster')
    const zone = await boxOf(page, 'touch-stick-zone')
    const slots = await slotBoxes(page)
    expect(slots).toHaveLength(Object.keys(STACKED_SLOTS).length)
    const laneTop = (cell.viewport.height * TOUCH_TILE_LANE_TOP_PERCENT.portrait) / PERCENT
    for (const slot of slots) {
      expect(Math.abs(slot.right - cluster.right), slot.testId).toBeLessThanOrEqual(SLACK_PX)
      expect(slot.top, slot.testId).toBeGreaterThanOrEqual(laneTop - SLACK_PX)
    }
    const [fire] = (await declaredHudBoxes(page)).filter((box) => box.testId === FIRE_TILE)
    const columnFoot = Math.max(...slots.map((slot) => slot.bottom))
    expect(Math.abs(fire.bottom - columnFoot)).toBeLessThanOrEqual(SLACK_PX)
    expect(fire.left - zone.right).toBeGreaterThanOrEqual(CLUSTER_GAP_PX)
    // Above the cluster's buttons: a tablet's three-row grid keeps the badge's row free beside
    // them, as sideways.
    const buttonsTop = Math.min(...(await clusterButtonBoxes(page)).map((button) => button.top))
    for (const tile of [...slots, fire]) {
      expect(buttonsTop - tile.bottom, tile.testId).toBeGreaterThanOrEqual(
        CLUSTER_GAP_PX - SLACK_PX,
      )
    }
    expect(errors).toEqual([])
  })

  test('keeps every control inside the safe area, apart, off the HUD and off the vehicle with a stacked loadout', async ({
    page,
  }) => {
    const errors = await openGame(page, currentCell())
    await stackLoadout(page)
    await expectControlsPlaced(page)
    expect(errors).toEqual([])
  })

  test('mirrors the zone to the lower right and the cluster and tiles to the left edge when left-handed', async ({
    page,
  }) => {
    const cell = currentCell()
    const errors = await openGame(page, cell)
    await page.evaluate(() => window.steampunkDebug!.ui.setPref('leftHanded', true))
    await stackLoadout(page)
    const safe = await boxOf(page, 'safe-area')
    const zone = await boxOf(page, 'touch-stick-zone')
    expect(Math.abs(zone.right - safe.right)).toBeLessThanOrEqual(SLACK_PX)
    expect(Math.abs(zone.top - zoneTopOf(cell))).toBeLessThanOrEqual(SLACK_PX)
    expect(isPointInside({ x: safe.right - 1, y: safe.bottom - 1 }, zone)).toBe(true)
    const cluster = await boxOf(page, 'touch-cluster')
    expect(zone.left - cluster.right).toBeGreaterThanOrEqual(CLUSTER_GAP_PX)
    const interact = await boxOf(page, 'touch-interact')
    expect(Math.abs(interact.left - cluster.left)).toBeLessThanOrEqual(SLACK_PX)
    for (const slot of await slotBoxes(page)) {
      expect(Math.abs(slot.left - cluster.left), slot.testId).toBeLessThanOrEqual(SLACK_PX)
    }
    expect((await boxOf(page, FIRE_TILE)).right).toBeLessThanOrEqual(zone.left - CLUSTER_GAP_PX)
    await expectControlsPlaced(page)
    expect(errors).toEqual([])
  })
})

/** A phone keeps the compact HUD upright; a tablet, past the 800 px short axis, the full one. */
function isPhone(cell: ScreenCell): boolean {
  return shortAxisOf(cell) < HUD_COMPACT_COARSE_SHORT_AXIS_PX
}

function expectedDensityOf(cell: ScreenCell): string {
  return isPhone(cell) ? 'compact' : 'full'
}

function densityOf(page: Page): Promise<string> {
  return page.evaluate(() => document.documentElement.dataset.hudDensity ?? '')
}

/** The zone's top edge: 55% of the way down the screen (the cells have no insets). */
function zoneTopOf(cell: ScreenCell): number {
  return (cell.viewport.height * (PERCENT - STICK_ZONE_HEIGHT_PERCENT)) / PERCENT
}

function zoneWidthMaxOf(cell: ScreenCell): number {
  return (cell.viewport.width * STICK_ZONE_WIDTH_PERCENT) / PERCENT + SLACK_PX
}

/** Two rows on a phone (Plant charge's over Interact's), three on a tablet as sideways. */
function clusterHeightOf(cell: ScreenCell): number {
  const twoRows = CLUSTER_BUTTON_PX + CLUSTER_GAP_PX + INTERACT_BUTTON_PX
  return isPhone(cell) ? twoRows : BADGE_ROW_PX + CLUSTER_GAP_PX + twoRows
}

/** Guns, a charge rack, five slotted power-ups and the bore gun: every tile and most buttons. */
async function stackLoadout(page: Page): Promise<void> {
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
  await expect(page.getByTestId('touch-toggle_guns')).toBeVisible()
  await expect(page.getByTestId('touch-plant_charge')).toBeVisible()
  await expect(page.getByTestId(FIRE_TILE)).toBeVisible()
  await expect(page.locator(`[data-testid^="${SLOT_TEST_ID_PREFIX}"]`)).toHaveCount(
    Object.keys(STACKED_SLOTS).length,
  )
}

async function slotBoxes(page: Page): Promise<HudBox[]> {
  const boxes = await declaredHudBoxes(page)
  return boxes.filter((box) => box.testId.startsWith(SLOT_TEST_ID_PREFIX))
}

function clusterButtonBoxes(page: Page): Promise<Box[]> {
  return page
    .getByTestId('touch-cluster')
    .locator('button')
    .evaluateAll((buttons) =>
      buttons.map((button) => {
        const { left, top, right, bottom, width, height } = button.getBoundingClientRect()
        return { left, top, right, bottom, width, height }
      }),
    )
}

/** Each control inside the safe area, none on another, on a HUD box or on the vehicle's body. */
async function expectControlsPlaced(page: Page): Promise<void> {
  const safe = await boxOf(page, 'safe-area')
  const boxes = await declaredHudBoxes(page)
  const controls = boxes.filter((box) => box.id === 'control')
  const hud = boxes.filter((box) => box.id !== 'control')
  expect(controls.filter((control) => !isInside(control, safe)).map(nameOf)).toEqual([])
  expect(overlappingPairsOf(controls, controls)).toEqual([])
  expect(overlappingPairsOf(controls, hud)).toEqual([])
  const vehicle = await vehicleBox(page)
  expect(controls.filter((control) => overlaps(control, vehicle)).map(nameOf)).toEqual([])
}

function overlappingPairsOf(boxes: readonly HudBox[], others: readonly HudBox[]): string[] {
  return boxes.flatMap((box) =>
    others
      .filter((other) => other !== box && overlaps(shaved(box), other))
      .map((other) => `${nameOf(box)} x ${nameOf(other)}`),
  )
}

/** Touching edges and sub-pixel layout are not overlap. */
function shaved(box: HudBox): HudBox {
  return {
    ...box,
    left: box.left + 0.5,
    top: box.top + 0.5,
    right: box.right - 0.5,
    bottom: box.bottom - 0.5,
  }
}

function nameOf(box: HudBox): string {
  return `${box.id}:${box.testId}`
}

async function vehicleBox(page: Page): Promise<Box> {
  const box = await page.evaluate(() => {
    const result = window.steampunkDebug!.ui.getVehicleScreenBox()
    if (!result.ok) throw new Error(result.problems.join('; '))
    return result.box
  })
  return { ...box, width: box.right - box.left, height: box.bottom - box.top }
}

function isPointInside(point: { x: number; y: number }, box: Box): boolean {
  return point.x >= box.left && point.x <= box.right && point.y >= box.top && point.y <= box.bottom
}

function isInside(inner: Box, outer: Box): boolean {
  return (
    inner.left >= outer.left - SLACK_PX &&
    inner.top >= outer.top - SLACK_PX &&
    inner.right <= outer.right + SLACK_PX &&
    inner.bottom <= outer.bottom + SLACK_PX
  )
}
