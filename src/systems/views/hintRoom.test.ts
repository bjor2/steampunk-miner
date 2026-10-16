import { describe, expect, it } from 'vitest'
import { hintChipHeightOf, hintRoomOf, type HintRoomInput } from './hintRoom'
import { vehicleKeepClearOf } from './hudClearView'

const box = (left: number, top: number, right: number, bottom: number) => ({
  left,
  top,
  right,
  bottom,
})

const UPRIGHT: HintRoomInput = {
  screen: { width: 390, height: 844 },
  orientation: 'portrait',
  safeArea: box(0, 0, 390, 844),
  rows: [box(8, 8, 46, 38), box(326, 8, 382, 66), box(8, 74, 382, 107), box(8, 115, 382, 150)],
  covering: [box(8, 8, 46, 38), box(326, 8, 382, 66), box(8, 74, 382, 107), box(8, 115, 382, 150)],
  keepOut: [box(0, 464, 156, 844), box(302, 756, 374, 828)],
}

describe('hint room (#500)', () => {
  it('puts the chip under the lowest row, across the safe width held upright', () => {
    const { chip } = hintRoomOf(UPRIGHT)
    expect(chip).toEqual({ left: 8, top: 158, right: 382, bottom: 198 })
  })

  it('shows the chip while the view keeps 70% clear and the vehicle stays uncovered', () => {
    // One row of controls, so the chip ends above the rig at its furthest lean down the screen,
    // 0.6 of the half height (ticket 484).
    const rows = UPRIGHT.rows.slice(0, 2)
    const room = hintRoomOf({ ...UPRIGHT, rows, covering: rows })
    expect(room.chip.bottom).toBeLessThan(vehicleKeepClearOf(UPRIGHT.screen).top)
    expect(room.hasRoom).toBe(true)
  })

  it('queues the chip when it would reach into the vehicle keep-clear square', () => {
    const deepRows = [...UPRIGHT.rows, box(8, 158, 382, 260)]
    const room = hintRoomOf({ ...UPRIGHT, rows: deepRows, covering: deepRows })
    expect(room.chip.bottom).toBeGreaterThan(vehicleKeepClearOf(UPRIGHT.screen).top)
    expect(room.hasRoom).toBe(false)
  })

  it('queues the chip when it would take the clear view under the floor', () => {
    const crowded = [...UPRIGHT.covering, box(0, 300, 390, 560)]
    expect(hintRoomOf({ ...UPRIGHT, covering: crowded }).hasRoom).toBe(false)
  })

  it('queues the chip rather than put it over the stick zone or a touch button', () => {
    const zone = box(0, 150, 156, 844)
    expect(hintRoomOf({ ...UPRIGHT, keepOut: [zone] }).hasRoom).toBe(false)
  })

  it('puts the chip in the left column sideways, short of the vehicle square', () => {
    const screen = { width: 844, height: 390 }
    const rows = [box(8, 8, 270, 40), box(599, 8, 836, 120)]
    const { chip } = hintRoomOf({
      ...UPRIGHT,
      screen,
      orientation: 'landscape',
      safeArea: box(0, 0, 844, 390),
      rows,
      covering: rows,
      keepOut: [],
    })
    expect(chip.left).toBe(8)
    expect(chip.right).toBeLessThan(vehicleKeepClearOf(screen).left)
    expect(chip.top).toBe(48)
  })

  it('keeps the chip at most 8% of the screen height and one line tall', () => {
    expect(hintChipHeightOf({ width: 390, height: 844 })).toBe(40)
    expect(hintChipHeightOf({ width: 844, height: 390 })).toBeCloseTo(31.2, 6)
    expect(hintChipHeightOf({ width: 640, height: 360 })).toBeCloseTo(28.8, 6)
  })
})
