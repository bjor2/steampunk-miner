import { describe, expect, it } from 'vitest'
import { BODY_HALF_SIZE_MM } from '../../constants/balance'
import {
  VIEW_SHORT_AXIS_DEFAULT_M,
  VIEW_SHORT_AXIS_MAX_M,
  VIEW_SHORT_AXIS_MIN_M,
} from '../../constants/scene'
import {
  hazardStripEdgeShiftInto,
  hazardStripReachOf,
  hazardStripStyleOf,
} from './hazardStripPlace'

// VS on #500: the hazard strip is its own box, out of the vehicle's way at every zoom, and its
// size depends on the screen alone.

const CELLS = [
  { width: 390, height: 844 },
  { width: 412, height: 915 },
  { width: 844, height: 390 },
  { width: 915, height: 412 },
  { width: 320, height: 568 },
  { width: 1920, height: 1080 },
]
const ZOOMS = [VIEW_SHORT_AXIS_MIN_M, VIEW_SHORT_AXIS_DEFAULT_M, VIEW_SHORT_AXIS_MAX_M]

describe('hazard strip place (#500, VS)', () => {
  it('keeps the hazard strip a separate box that the vehicle keep-clear rect never intersects at any zoom from 8 to 20 m and at the 12 m default', () => {
    for (const screen of CELLS) {
      for (const zoom of ZOOMS) {
        // The zoom spans the height in either orientation (ticket 484).
        const bodyHalf = (BODY_HALF_SIZE_MM / 1000) * (screen.height / zoom)
        expect(hazardStripReachOf(screen).inner).toBeGreaterThan(bodyHalf)
      }
    }
  })

  it('keeps the hazard strip the same size per orientation at any drill level, speed and depth', () => {
    expect(hazardStripReachOf({ width: 390, height: 844 })).toEqual(
      hazardStripReachOf({ width: 844, height: 390 }),
    )
    expect(hazardStripStyleOf()).toEqual({ '--strip-inner': '14vmin', '--strip-length': '30vmin' })
  })
})

// Ticket 685 (spec #678): on a phone the track keeps its reach and its line along the drive, but
// slides out of the shaft to the screen's edge, so no warning sits over the cut.

const PHONE_CELLS = [
  { width: 360, height: 640 },
  { width: 390, height: 844 },
  { width: 844, height: 390 },
]
const UP = 0
const LEFT = Math.PI / 2
const DOWN = Math.PI
const RIGHT = -Math.PI / 2
const EIGHTHS = Array.from({ length: 8 }, (_, step) => (step * Math.PI) / 4)

function shiftOf(screen: { width: number; height: number }, angle: number) {
  return hazardStripEdgeShiftInto({ x: 0, y: 0 }, screen, angle)
}

/** The track's two ends on screen once shifted, the drive `angle` counter-clockwise from up. */
function trackEndsOf(screen: { width: number; height: number }, angle: number) {
  const shift = shiftOf(screen, angle)
  const { inner, length } = hazardStripReachOf(screen)
  const end = (reach: number) => ({
    x: screen.width / 2 + shift.x - Math.sin(angle) * reach,
    y: screen.height / 2 + shift.y - Math.cos(angle) * reach,
  })
  return [end(inner), end(inner + length)]
}

describe('hazard strip along the phone edge (ticket 685)', () => {
  it('lays the track in the left edge lane for a drive down or up at 360x640', () => {
    const screen = PHONE_CELLS[0]
    for (const angle of [DOWN, UP]) {
      const shift = shiftOf(screen, angle)
      expect(shift.x).toBeCloseTo(-(screen.width / 2 - 16))
      expect(shift.y).toBeCloseTo(0)
    }
  })

  it('lays the track under the strip for a drive across at 360x640', () => {
    const screen = PHONE_CELLS[0]
    for (const angle of [LEFT, RIGHT]) {
      const shift = shiftOf(screen, angle)
      expect(shift.x).toBeCloseTo(0)
      expect(screen.height / 2 + shift.y).toBeCloseTo(36 + 8 + 16)
    }
  })

  it('moves the track clear of the shaft and keeps it all on screen for every eighth of a turn', () => {
    for (const screen of PHONE_CELLS) {
      for (const angle of EIGHTHS) {
        const shift = shiftOf(screen, angle)
        expect(Math.hypot(shift.x, shift.y)).toBeGreaterThanOrEqual(
          hazardStripReachOf(screen).inner,
        )
        for (const end of trackEndsOf(screen, angle)) {
          expect(end.x).toBeGreaterThanOrEqual(0)
          expect(end.x).toBeLessThanOrEqual(screen.width)
          // A sideways phone's drive straight up still runs the far end under the strip, as the
          // #316 track always did there: only the anchor moves, never the reach.
          expect(end.y).toBeGreaterThanOrEqual(0)
          expect(end.y).toBeLessThanOrEqual(screen.height)
        }
      }
    }
  })

  it('keeps the track the same length and line: only its anchor moves', () => {
    const screen = PHONE_CELLS[0]
    const [near, far] = trackEndsOf(screen, DOWN)
    expect(far.y - near.y).toBeCloseTo(hazardStripReachOf(screen).length)
    expect(far.x).toBeCloseTo(near.x)
  })
})
