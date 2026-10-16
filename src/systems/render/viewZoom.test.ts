import { describe, expect, it } from 'vitest'
import { STRIP_SIDE_CELLS } from '../../constants/hazardStrip'
import {
  VIEW_HALF_DIAGONAL_MAX_M,
  VIEW_SHORT_AXIS_DEFAULT_M,
  VIEW_SHORT_AXIS_MIN_M,
} from '../../constants/scene'
import { createSpeedFraming, framedShortAxisOf, stepSpeedFraming } from './speedFraming'
import {
  cameraViewOf,
  easeViewShortAxis,
  maxViewVerticalOf,
  pixelsPerMetreOf,
  shownViewShortAxisOf,
  viewHorizontalMetresOf,
  viewShortAxisProblems,
  zoomedIn,
  zoomedOut,
} from './viewZoom'

function zoomRepeatedly(step: (metres: number) => number, times: number): number {
  let metres = VIEW_SHORT_AXIS_DEFAULT_M
  for (let i = 0; i < times; i++) metres = step(metres)
  return metres
}

function easeFor(seconds: number, stepsPerSecond: number, from: number, to: number): number {
  let metres = from
  for (let i = 0; i < Math.round(seconds * stepsPerSecond); i++) {
    metres = easeViewShortAxis(metres, to, 1 / stepsPerSecond)
  }
  return metres
}

describe('zoom framing', () => {
  it.each([
    [1920, 1080],
    [3840, 2160],
  ])(
    'shows 12 m across the short axis at %i x %i with the collider at 7.5% of it',
    (width, height) => {
      const view = cameraViewOf(width, height, VIEW_SHORT_AXIS_DEFAULT_M)
      expect(view.viewShortAxisMetres).toBe(12)
      expect(view.vehicleColliderShare).toBeCloseTo(0.075, 3)
      expect(view.pixelsPerMetre * 12).toBe(height)
    },
  )

  it('frames the same world at 1080p and 4K, only sharper', () => {
    const fullHd = pixelsPerMetreOf(1080, 12)
    const fourK = pixelsPerMetreOf(2160, 12)
    expect(fourK).toBe(fullHd * 2)
    expect(fourK).toBe(180)
  })

  it('steps by a factor of 1.25 per zoom action', () => {
    expect(zoomedOut(12)).toBeCloseTo(15, 9)
    expect(zoomedIn(12)).toBeCloseTo(9.6, 9)
  })

  it('clamps zooming in at 8 m and zooming out at 20 m', () => {
    expect(zoomRepeatedly(zoomedIn, 10)).toBe(8)
    expect(zoomRepeatedly(zoomedOut, 10)).toBe(20)
  })

  it('accepts a view from 8 m to 20 m and refuses anything else', () => {
    expect(viewShortAxisProblems(8)).toEqual([])
    expect(viewShortAxisProblems(20)).toEqual([])
    expect(viewShortAxisProblems(7.99)).toHaveLength(1)
    expect(viewShortAxisProblems(21)).toHaveLength(1)
    expect(viewShortAxisProblems('12')).toHaveLength(1)
    expect(viewShortAxisProblems(Number.NaN)).toHaveLength(1)
  })

  it('eases a zoom step within 0.2 s and lands on the target', () => {
    expect(easeFor(0.2, 60, 12, 15)).toBeCloseTo(15, 0)
    expect(easeFor(1, 60, 12, 15)).toBe(15)
  })

  it('eases the same at 30 and 144 frames per second', () => {
    expect(easeFor(1 / 6, 30, 12, 20)).toBeCloseTo(easeFor(1 / 6, 144, 12, 20), 9)
  })
})

describe('zoom cap by screen shape', () => {
  it.each([
    ['16:9', 1920, 1080, 20],
    ['16:10', 1280, 800, 20],
    ['4:3', 1024, 768, 20],
    ['21:9', 2560, 1080, 15.86],
    ['19.5:9', 1950, 900, 17.1],
    ['20:9', 2000, 900, 16.74],
  ])(
    'lets a %s screen zoom out to %s x %s at most %s m (#173 cap table)',
    (_, width, height, cap) => {
      expect(maxViewVerticalOf(width, height)).toBeCloseTo(cap, 2)
    },
  )

  it('keeps the half diagonal of the widest view within 20.40 m, the #38 budget', () => {
    for (const [width, height] of [
      [2560, 1080],
      [844, 390],
      [1180, 820],
    ]) {
      const metres = maxViewVerticalOf(width, height)
      const halfDiagonal = (Math.hypot(width, height) / Math.min(width, height)) * metres * 0.5
      expect(halfDiagonal).toBeLessThanOrEqual(20.4 + 1e-9)
    }
  })

  it('shows the chosen view under the cap and the cap past it', () => {
    expect(shownViewShortAxisOf(2560, 1080, 12)).toBe(12)
    expect(shownViewShortAxisOf(2560, 1080, 20)).toBeCloseTo(15.86, 2)
    expect(shownViewShortAxisOf(1920, 1080, 20)).toBe(20)
  })

  it('allows the full 20 m zoom-out before the canvas has a size', () => {
    expect(maxViewVerticalOf(0, 0)).toBe(20)
  })

  it('reports the cap with the framing the debug API reads', () => {
    expect(cameraViewOf(2560, 1080, 12).maxViewShortAxisMetres).toBeCloseTo(15.86, 2)
  })
})

/** The three portrait cells of ticket 484: iPhone 13 class, Pixel 7 class and a tablet. */
const PORTRAIT_CELLS = [
  [390, 844],
  [412, 915],
  [820, 1180],
] as const
const MM_PER_METRE = 1000

function horizontalMillimetresOf(width: number, height: number, verticalMetres: number): number {
  return Math.floor(viewHorizontalMetresOf(width, height, verticalMetres) * MM_PER_METRE)
}

/** The vertical extent the camera frames after 10 s of a steady descent at `speed` cells/s. */
function framedVerticalAt(speed: number, width: number, height: number): number {
  const framing = createSpeedFraming()
  for (let frame = 0; frame < 600; frame++) {
    stepSpeedFraming(framing, { x: 0, y: -speed }, { x: 0, y: -1 }, 1 / 60)
  }
  const shown = shownViewShortAxisOf(width, height, VIEW_SHORT_AXIS_DEFAULT_M)
  return framedShortAxisOf(framing, shown, maxViewVerticalOf(width, height))
}

/** Screens a second a descent crosses: its speed in pixels over the screen's height. */
function screensPerSecondOf(speed: number, width: number, height: number): number {
  const pixelsPerMetre = pixelsPerMetreOf(height, framedVerticalAt(speed, width, height))
  return (speed * pixelsPerMetre) / height
}

describe('the portrait framing (ticket 484)', () => {
  it('a portrait screen shows the same vertical metres as a landscape one at the same zoom', () => {
    for (const [width, height] of PORTRAIT_CELLS) {
      const portrait = cameraViewOf(width, height, VIEW_SHORT_AXIS_DEFAULT_M)
      const landscape = cameraViewOf(1920, 1080, VIEW_SHORT_AXIS_DEFAULT_M)
      expect(height / portrait.pixelsPerMetre).toBe(1080 / landscape.pixelsPerMetre)
      expect(portrait.vehicleColliderShare).toBe(landscape.vehicleColliderShare)
      expect(portrait.vehicleColliderShare).toBeCloseTo(0.075, 9)
    }
  })

  it('pixels per metre is the screen height over the vertical extent in both orientations', () => {
    expect(pixelsPerMetreOf(844, 12)).toBe(844 / 12)
    expect(cameraViewOf(390, 844, 12).pixelsPerMetre).toBe(844 / 12)
    expect(cameraViewOf(844, 390, 12).pixelsPerMetre).toBe(390 / 12)
    expect(cameraViewOf(1920, 1080, 12).pixelsPerMetre).toBe(90)
  })

  it('the horizontal extent is the vertical extent times width over height (5545, 5403 and 8338 mm at 12 m on 390x844, 412x915 and 820x1180)', () => {
    const millimetres = PORTRAIT_CELLS.map(([width, height]) =>
      horizontalMillimetresOf(width, height, 12),
    )
    expect(millimetres).toEqual([5545, 5403, 8338])
    expect(cameraViewOf(390, 844, 12).viewHorizontalMetres).toBe(
      viewHorizontalMetresOf(390, 844, 12),
    )
  })

  it('the horizontal extent at the 8 m zoom-in floor is at least 3 cells on 390x844, 412x915 and 820x1180 (3696, 3602 and 5559 mm)', () => {
    const cellsWide = (2 * STRIP_SIDE_CELLS + 1) * MM_PER_METRE
    const millimetres = PORTRAIT_CELLS.map(([width, height]) =>
      horizontalMillimetresOf(width, height, VIEW_SHORT_AXIS_MIN_M),
    )
    expect(millimetres).toEqual([3696, 3602, 5559])
    for (const width of millimetres) expect(width).toBeGreaterThanOrEqual(cellsWide)
  })

  it('the widest vertical view is 20 m on every portrait cell, and the landscape caps stay 20, 15.86, 17.11 and 16.75', () => {
    for (const [width, height] of PORTRAIT_CELLS) expect(maxViewVerticalOf(width, height)).toBe(20)
    expect(maxViewVerticalOf(1920, 1080)).toBe(20)
    expect(maxViewVerticalOf(2560, 1080)).toBeCloseTo(15.86, 2)
    expect(maxViewVerticalOf(844, 390)).toBeCloseTo(17.11, 2)
    expect(maxViewVerticalOf(915, 412)).toBeCloseTo(16.75, 2)
  })

  it('the half diagonal at the widest portrait view stays under 20.40 m', () => {
    const halfDiagonals = PORTRAIT_CELLS.map(([width, height]) => {
      const vertical = maxViewVerticalOf(width, height)
      return Math.hypot(vertical, viewHorizontalMetresOf(width, height, vertical)) / 2
    })
    expect(halfDiagonals.map((metres) => Number(metres.toFixed(1)))).toEqual([11, 11, 12.2])
    for (const metres of halfDiagonals) expect(metres).toBeLessThan(VIEW_HALF_DIAGONAL_MAX_M)
  })

  it('a vertical drive crosses the same share of the screen each second in portrait and landscape at 3, 6, 10, 15, 25 and 44 m/s (0.25, 0.50, 0.79, 0.80, 1.25 and 2.20)', () => {
    const rows = [
      [3, 0.25],
      [6, 0.5],
      [10, 0.79],
      [15, 0.8],
      [25, 1.25],
      [44, 2.2],
    ] as const
    for (const [speed, screensPerSecond] of rows) {
      const desktop = screensPerSecondOf(speed, 1920, 1080)
      expect(desktop).toBeCloseTo(screensPerSecond, 2)
      for (const [width, height] of PORTRAIT_CELLS) {
        expect(screensPerSecondOf(speed, width, height)).toBeCloseTo(desktop, 9)
      }
    }
  })
})
