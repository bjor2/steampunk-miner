import { describe, expect, it } from 'vitest'
import { COARSE_TARGET_PX, HINT_CHIP_GAP_PX } from '../../constants/screen'
import { CLUSTER_BUTTON_PX, INTERACT_BUTTON_PX } from '../../constants/touch'
import { SLOT_ACTION_IDS, SOCKET_ACTION_IDS } from '../input/touchControls'
import { hintChipHeightOf } from './hintRoom'
import {
  clearShareOf,
  clearViewFloorOf,
  coveredAreaOf,
  doBoxesOverlap,
  isHintRoomFor,
  vehicleKeepClearOf,
  vehicleScreenBoxOf,
  type ScreenBox,
  type ScreenSize,
} from './hudClearView'

const PHONE = { width: 390, height: 844 }
const box = (left: number, top: number, right: number, bottom: number) => ({
  left,
  top,
  right,
  bottom,
})

describe('HUD clear view (#500)', () => {
  it('unions overlapping boxes once', () => {
    const area = coveredAreaOf([box(0, 0, 100, 100), box(50, 50, 150, 150)], PHONE)
    expect(area).toBe(100 * 100 * 2 - 50 * 50)
  })

  it('counts a box inside another once', () => {
    expect(coveredAreaOf([box(0, 0, 100, 100), box(10, 10, 20, 20)], PHONE)).toBe(10_000)
  })

  it('counts only the part of a box on the screen', () => {
    expect(coveredAreaOf([box(-50, -50, 50, 50)], PHONE)).toBe(2_500)
  })

  it('leaves the whole view clear with no box', () => {
    expect(clearShareOf([], PHONE)).toBe(1)
  })

  it('reads 70% upright and 65% sideways as the floors', () => {
    expect(clearViewFloorOf('portrait')).toBe(0.7)
    expect(clearViewFloorOf('landscape')).toBe(0.65)
  })

  it('queues a hint whose box would drop the clear share below the floor', () => {
    const hud = [box(0, 0, 390, 240)]
    expect(isHintRoomFor(hud, box(0, 240, 390, 300), PHONE, 0.7)).toBe(false)
  })

  it('shows a hint that fits with room to spare', () => {
    const hud = [box(0, 0, 390, 120)]
    expect(isHintRoomFor(hud, box(0, 128, 390, 180), PHONE, 0.7)).toBe(true)
  })

  it('treats touching edges as clear of each other, and shared area as overlap', () => {
    expect(doBoxesOverlap(box(0, 0, 10, 10), box(10, 0, 20, 10))).toBe(false)
    expect(doBoxesOverlap(box(0, 0, 10, 10), box(9, 9, 20, 20))).toBe(true)
    expect(doBoxesOverlap(box(0, 0, 10, 10), box(9.6, 0, 20, 10), 0.5)).toBe(false)
  })

  it('keeps the vehicle inside a rect round the middle, wide and tall as the furthest lean', () => {
    const rect = vehicleKeepClearOf(PHONE)
    expect(rect.left).toBeGreaterThan(0)
    expect(rect.right).toBeLessThan(PHONE.width)
    expect((rect.left + rect.right) / 2).toBe(195)
    expect((rect.top + rect.bottom) / 2).toBe(422)
    // 0.6 of the half width and of the half height, plus the body's 0.45 m at the closest zoom
    // (8 m down 844 px, ticket 484).
    expect(rect.right - 195).toBeCloseTo(0.6 * 195 + 0.45 * (844 / 8), 6)
    expect(422 - rect.top).toBeCloseTo(0.6 * 422 + 0.45 * (844 / 8), 6)
  })

  it('keeps the rect square on a landscape screen', () => {
    const sideways = vehicleKeepClearOf({ width: 844, height: 390 })
    expect(sideways.right - sideways.left).toBeCloseTo(sideways.bottom - sideways.top, 6)
    expect(sideways.right - 422).toBeCloseTo(0.6 * 195 + 0.45 * (390 / 8), 6)
  })
})

describe('vehicle on screen (#500)', () => {
  const view = { width: 400, height: 800, pixelsPerMetre: 40, turnRadians: 0 }

  it('draws the vehicle at the middle with no lean, its body 0.9 m across', () => {
    const box = vehicleScreenBoxOf({ ...view, fromCentre: { x: 0, y: 0 } })
    expect(box).toEqual({ left: 182, top: 382, right: 218, bottom: 418 })
  })

  it('moves the vehicle up the screen when the camera leans down ahead of it', () => {
    const box = vehicleScreenBoxOf({ ...view, fromCentre: { x: 0, y: 2 } })
    expect((box.top + box.bottom) / 2).toBe(320)
  })

  it('turns the offset with the camera roll', () => {
    const box = vehicleScreenBoxOf({
      ...view,
      fromCentre: { x: 0, y: 2 },
      turnRadians: Math.PI / 2,
    })
    expect((box.left + box.right) / 2).toBeCloseTo(280, 6)
    expect((box.top + box.bottom) / 2).toBeCloseTo(400, 6)
  })

  it('stays inside the keep-clear rect at the furthest lean and the closest zoom', () => {
    const screen = { width: 390, height: 844 }
    const pixelsPerMetre = 844 / 8
    const leanAcross = (0.6 * 390) / 2 / pixelsPerMetre
    const leanUp = (0.6 * 844) / 2 / pixelsPerMetre
    const rect = vehicleKeepClearOf(screen)
    for (const fromCentre of [
      { x: leanAcross, y: 0 },
      { x: -leanAcross, y: 0 },
      { x: 0, y: leanUp },
      { x: 0, y: -leanUp },
    ]) {
      const box = vehicleScreenBoxOf({ ...screen, pixelsPerMetre, turnRadians: 0, fromCentre })
      expect(box.left).toBeGreaterThanOrEqual(rect.left - 1e-9)
      expect(box.right).toBeLessThanOrEqual(rect.right + 1e-9)
      expect(box.top).toBeGreaterThanOrEqual(rect.top - 1e-9)
      expect(box.bottom).toBeLessThanOrEqual(rect.bottom + 1e-9)
    }
  })
})

// GD ruling 2 on #500: with every control owned, three status chips and the hint the view
// missed its floor by 1.0 to 5.4 points, and #486 (threat chips, prompts, the status row) owned the
// gap. These are the TD's arithmetic made exact: the compact HUD's boxes as Chromium lays them out
// in that state on each cell (measured on the dev server at #486's layout, ui-scale 1, drilling with
// a full hold, hull and energy critical, a staged threat and the debug mark), plus the most touch
// controls the vehicle layer shows at once at their sizes, which never overlap a HUD box. The hint
// shows only where it leaves the floor standing, as the hint queue rules (`isHintRoomFor`). The
// browser spec measures the reachable loadout on the same cells (`hudLayout.spec.ts`).
const STACKED_CELLS = [
  {
    name: '390x844',
    screen: { width: 390, height: 844 },
    floor: 0.7,
    hud: [
      box(8, 74, 382, 106.8),
      box(8, 8, 155.1, 42.8),
      box(8, 114.8, 382, 170.4),
      box(326, 8, 382, 66),
      box(8, 178.4, 216.3, 213.2),
      box(17, 183.4, 83.1, 208.2),
    ],
  },
  {
    name: '412x915',
    screen: { width: 412, height: 915 },
    floor: 0.7,
    hud: [
      box(8, 74, 404, 106.8),
      box(8, 8, 156.4, 42.8),
      box(8, 114.8, 404, 170.4),
      box(348, 8, 404, 66),
      box(8, 178.4, 216.7, 213.2),
      box(17, 183.4, 83.4, 208.2),
    ],
  },
  {
    name: '844x390',
    screen: { width: 844, height: 390 },
    floor: 0.65,
    hud: [
      box(8, 8, 519.6, 40.8),
      box(8, 74, 155.1, 108.8),
      box(599.6, 74, 836, 154.4),
      box(780, 8, 836, 66),
      box(8, 119.2, 134.2, 152),
      box(784.9, 188.2, 836, 215),
    ],
  },
  {
    name: '915x412',
    screen: { width: 915, height: 412 },
    floor: 0.65,
    hud: [
      box(8, 8, 569.3, 40.8),
      box(8, 74, 155.1, 108.8),
      box(649.3, 74, 907, 154.4),
      box(851, 8, 907, 66),
      box(8, 119.2, 134.2, 152),
      box(855.9, 199.2, 907, 226),
    ],
  },
] as const

/** The charge-size badge over Plant charge (TouchControls.module.css `.sizeBadge`). */
const SIZE_BADGE_PX = 48

/**
 * Every touch control the vehicle layer can show at once while drilling: Interact, plant charge,
 * the guns and the tow call (`clusterActionsOf`; quick service is the platform's), the size badge,
 * the slot column's five power-up slots and two drill sockets and the fire tile at the cluster
 * button's 56 px, and the pause button as measured on a finger (56 px).
 */
const MOST_CONTROLS_AREA =
  INTERACT_BUTTON_PX ** 2 +
  3 * CLUSTER_BUTTON_PX ** 2 +
  SIZE_BADGE_PX ** 2 +
  (SLOT_ACTION_IDS.length + SOCKET_ACTION_IDS.length + 1) * CLUSTER_BUTTON_PX ** 2 +
  COARSE_TARGET_PX ** 2

/** The clear share with the most controls, and with the hint chip when the queue lets it show. */
function stackedShareOf(cell: (typeof STACKED_CELLS)[number]): number {
  const { screen, floor, hud } = cell
  const screenArea = screen.width * screen.height
  const without = 1 - (coveredAreaOf(hud, screen) + MOST_CONTROLS_AREA) / screenArea
  const chip = hintChipBoxUnder(hud, screen)
  const chipShare = ((chip.right - chip.left) * (chip.bottom - chip.top)) / screenArea
  const isShown = isHintRoomFor(hud, chip, screen, floor + MOST_CONTROLS_AREA / screenArea)
  return isShown ? without - chipShare : without
}

/** The hint chip's box under the rows, across the safe width (`hintRoom.ts`). */
function hintChipBoxUnder(hud: readonly ScreenBox[], screen: ScreenSize): ScreenBox {
  const top = Math.max(...hud.map((each) => each.bottom)) + HINT_CHIP_GAP_PX
  return box(16, top, screen.width - 16, top + hintChipHeightOf(screen))
}

describe('clear view of the stacked worst case (#486)', () => {
  for (const cell of STACKED_CELLS) {
    it(`keeps ${cell.floor * 100}% of ${cell.name} clear with every control owned, three status chips and the hint`, () => {
      expect(stackedShareOf(cell)).toBeGreaterThanOrEqual(cell.floor)
    })
  }
})
