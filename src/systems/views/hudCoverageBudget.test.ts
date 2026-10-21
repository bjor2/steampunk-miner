import { describe, expect, it } from 'vitest'
import { DESIGN_TOKENS } from './designSystem'
import { doBoxesOverlap, vehicleKeepClearOf, type ScreenSize } from './hudClearView'
import {
  coverageBudgetOf,
  hudBudgetBoxesOf,
  hudCoverageShareOf,
  isOutsideMiddleBand,
  isWithinCoverageBudget,
  middleBandOf,
  NO_INSETS,
  stickZoneOf,
  topKeepOutOf,
  type SafeInsets,
} from './hudCoverageBudget'

// The design's worked budget (docs/ui/design-system.md section 9): the strip, the slot bar and
// the edge gauge laid out from the tokens fit the GD lock's 12% and 8% on every screenshot cell
// of #689, with the phone's safe-area insets on, and never enter the middle band or the stick
// zone. The overlay (#682) and the suite (#689) measure the real boxes against the same numbers.

/** An iPhone's safe area: the notch and home bar held upright, the notch's sides and a thin bar sideways. */
const UPRIGHT_INSETS: SafeInsets = { top: 47, right: 0, bottom: 34, left: 0 }
const SIDEWAYS_INSETS: SafeInsets = { top: 0, right: 47, bottom: 21, left: 47 }
const PHONE_CELLS: Array<[string, ScreenSize, SafeInsets]> = [
  ['360x640', { width: 360, height: 640 }, UPRIGHT_INSETS],
  ['390x844', { width: 390, height: 844 }, UPRIGHT_INSETS],
  ['844x390', { width: 844, height: 390 }, SIDEWAYS_INSETS],
]
const DESKTOP_CELLS: Array<[string, ScreenSize]> = [
  ['1280x800', { width: 1280, height: 800 }],
  ['1440x900', { width: 1440, height: 900 }],
]
const PERCENT = 100

describe('HUD coverage budget', () => {
  it.each(PHONE_CELLS)(
    'keeps the phone HUD under 12%% of the screen at %s',
    (_, screen, insets) => {
      expect(hudCoverageShareOf('phone', screen, insets) * PERCENT).toBeLessThanOrEqual(12)
      expect(isWithinCoverageBudget('phone', screen, insets)).toBe(true)
    },
  )

  it.each(DESKTOP_CELLS)('keeps the desktop HUD under 8%% of the screen at %s', (_, screen) => {
    expect(hudCoverageShareOf('desktop', screen) * PERCENT).toBeLessThanOrEqual(8)
    expect(isWithinCoverageBudget('desktop', screen)).toBe(true)
  })

  it('reads the budget from the tokens', () => {
    expect(coverageBudgetOf('phone')).toBe(0.12)
    expect(coverageBudgetOf('desktop')).toBe(0.08)
  })

  it('covers the same share with the safe-area insets on: boxes move, they never grow', () => {
    const screen = { width: 360, height: 640 }
    const bare = hudCoverageShareOf('phone', screen, NO_INSETS)
    const notched = hudCoverageShareOf('phone', screen, UPRIGHT_INSETS)
    expect(notched).toBeCloseTo(bare, 6)
  })

  it('lays the worked phone budget out at 360x640: strip, six slot cells in two rows, a 4 px gauge', () => {
    const boxes = hudBudgetBoxesOf('phone', { width: 360, height: 640 })
    expect(boxes.strip).toEqual({ left: 0, top: 0, right: 360, bottom: 36 })
    expect(boxes.toolSlots).toEqual({ left: 212, top: 540, right: 352, bottom: 632 })
    expect(boxes.edgeGauge).toEqual({ left: 354, top: 192, right: 358, bottom: 448 })
  })

  it('lays a phone held sideways out in one row of six cells, clear of the band and the stick', () => {
    const screen = { width: 844, height: 390 }
    const { toolSlots } = hudBudgetBoxesOf('phone', screen, SIDEWAYS_INSETS)
    expect(toolSlots.right - toolSlots.left).toBe(6 * 44 + 5 * 4)
    expect(toolSlots.bottom - toolSlots.top).toBe(44)
  })

  it('lays the desktop strip out centred at its widest, with eight slots and the gear in one row', () => {
    const boxes = hudBudgetBoxesOf('desktop', { width: 1440, height: 900 })
    expect(boxes.strip).toEqual({ left: 360, top: 0, right: 1080, bottom: 44 })
    expect(boxes.toolSlots.right - boxes.toolSlots.left).toBe(9 * 48 + 8 * 4)
    expect(boxes.toolSlots.bottom - boxes.toolSlots.top).toBe(48)
  })
})

describe('HUD keep-outs', () => {
  it.each(PHONE_CELLS)(
    'keeps every phone box out of the middle band at %s, insets on',
    (_, screen, insets) => {
      const boxes = hudBudgetBoxesOf('phone', screen, insets)
      expect(isOutsideMiddleBand(boxes.strip, screen)).toBe(true)
      expect(isOutsideMiddleBand(boxes.toolSlots, screen)).toBe(true)
    },
  )

  it.each(DESKTOP_CELLS)('keeps every desktop box out of the middle band at %s', (_, screen) => {
    const boxes = hudBudgetBoxesOf('desktop', screen)
    expect(isOutsideMiddleBand(boxes.strip, screen)).toBe(true)
    expect(isOutsideMiddleBand(boxes.toolSlots, screen)).toBe(true)
  })

  it('spans the middle band between the edge lanes, where the edge gauge sits', () => {
    const screen = { width: 360, height: 640 }
    expect(middleBandOf(screen)).toEqual({ left: 8, top: 192, right: 352, bottom: 448 })
    const { edgeGauge } = hudBudgetBoxesOf('phone', screen)
    expect(doBoxesOverlap(edgeGauge, middleBandOf(screen))).toBe(false)
  })

  it('lies inside the static keep-clear of the camera lean, so the dynamic never-cover rule still binds', () => {
    const screen = { width: 360, height: 640 }
    const keepClear = vehicleKeepClearOf(screen)
    const band = middleBandOf(screen)
    expect(band.top).toBeGreaterThanOrEqual(keepClear.top)
    expect(band.bottom).toBeLessThanOrEqual(keepClear.bottom)
  })

  it.each(PHONE_CELLS)(
    'keeps the phone strip inside the top keep-out, where nothing takes a tap, at %s',
    (_, screen, insets) => {
      const { strip } = hudBudgetBoxesOf('phone', screen, insets)
      expect(strip.bottom).toBeLessThanOrEqual(topKeepOutOf(screen).bottom)
    },
  )

  it.each(PHONE_CELLS)(
    'keeps the slot bar out of the stick zone and in the thumb zone at %s',
    (_, screen, insets) => {
      const { toolSlots } = hudBudgetBoxesOf('phone', screen, insets)
      const stick = stickZoneOf(screen, insets)
      expect(doBoxesOverlap(toolSlots, stick)).toBe(false)
      expect(toolSlots.top).toBeGreaterThanOrEqual(stick.top)
    },
  )

  it('keeps every slot cell at the tap target minimum on both layouts', () => {
    const { toolSlots, tapTargetMinPx } = DESIGN_TOKENS.layout
    expect(toolSlots.cellPx.phone).toBeGreaterThanOrEqual(tapTargetMinPx)
    expect(toolSlots.cellPx.desktop).toBeGreaterThanOrEqual(tapTargetMinPx)
  })
})
