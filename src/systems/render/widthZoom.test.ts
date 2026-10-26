import { describe, expect, it } from 'vitest'
import { SPEED_FRAMING, VIEW_SHORT_AXIS_DEFAULT_M } from '../../constants/scene'
import { bodyHalfMmAt } from '../vehicle/drillBore'
import {
  createSpeedFraming,
  framedShortAxisOf,
  groundAheadOf,
  stepSpeedFraming,
  widthFramedShortAxisOf,
  type SpeedFraming,
} from './speedFraming'
import { cameraViewOf, maxViewVerticalOf, pixelsPerMetreOf, widthZoomOf } from './viewZoom'

// The #316 camera zooms with the rig's width (GD lock on #662 Part B, ticket 750): the player's
// zoom and the screen's cap scale by the collider's side over the bare 0.9 m, so the rig keeps its
// size on screen at every width level, on a 360 px phone and at 1280+, and the speed framing still
// shows the 1 s of ground ahead it shows a bare rig.

/** A 360 x 640 phone held upright, a 1280 x 720 and a 2560 x 1080 desktop. */
const SCREENS = [
  { width: 360, height: 640 },
  { width: 1280, height: 720 },
  { width: 2560, height: 1080 },
]
const VERY_HIGH_LEVELS = [1, 10, 1_000, 1_000_000]
const FRAME_SECONDS = 1 / 60

function halfSideAt(level: number): number {
  return bodyHalfMmAt(level) / 1000
}

/** The framing after ten seconds' drive at `speed` m/s down the screen. */
function framingAt(speed: number): SpeedFraming {
  const framing = createSpeedFraming()
  for (let frame = 0; frame < 600; frame++) {
    stepSpeedFraming(framing, { x: 0, y: -speed }, { x: 0, y: -1 }, FRAME_SECONDS)
  }
  return framing
}

/** The rig's height on screen, px, at the view a framing shows it in. */
function rigPixelsOf(
  screen: { width: number; height: number },
  level: number,
  framing: SpeedFraming,
) {
  const cap = maxViewVerticalOf(screen.width, screen.height)
  const vertical = widthFramedShortAxisOf(
    framing,
    VIEW_SHORT_AXIS_DEFAULT_M,
    cap,
    widthZoomOf(halfSideAt(level)),
  )
  return 2 * halfSideAt(level) * pixelsPerMetreOf(screen.height, vertical)
}

describe('width zoom', () => {
  it('frames a bare rig exactly as before', () => {
    expect(widthZoomOf(halfSideAt(0))).toBe(1)
    const framing = framingAt(30)
    expect(widthFramedShortAxisOf(framing, 12, 20, 1)).toBe(framedShortAxisOf(framing, 12, 20))
  })

  it('scales the view by the rig’s side over the bare 0.9 m', () => {
    expect(widthZoomOf(halfSideAt(1))).toBeCloseTo(1.9 / 0.9, 12)
    expect(widthZoomOf(halfSideAt(10))).toBeCloseTo(10.9 / 0.9, 12)
  })

  it('keeps the rig its bare size on screen at every width level, on a phone and at 1280+', () => {
    const still = createSpeedFraming()
    for (const screen of SCREENS) {
      const bare = rigPixelsOf(screen, 0, still)
      for (const level of VERY_HIGH_LEVELS) {
        expect(rigPixelsOf(screen, level, still) / bare).toBeCloseTo(1, 6)
      }
    }
  })

  it('keeps the rig readable on a 360 px phone at a very high level', () => {
    const still = createSpeedFraming()
    expect(rigPixelsOf(SCREENS[0], 1_000_000, still)).toBeGreaterThan(20)
  })

  it('shows at least the 1 s of ground ahead a bare rig sees, at speed, at every width level', () => {
    for (const speed of [8, 30, 80]) {
      const framing = framingAt(speed)
      for (const screen of SCREENS) {
        const cap = maxViewVerticalOf(screen.width, screen.height)
        const bare = framedShortAxisOf(framing, VIEW_SHORT_AXIS_DEFAULT_M, cap)
        for (const level of VERY_HIGH_LEVELS) {
          const zoom = widthZoomOf(halfSideAt(level))
          const wide = widthFramedShortAxisOf(framing, VIEW_SHORT_AXIS_DEFAULT_M, cap, zoom)
          const aheadM = groundAheadOf(wide, framing.leadShare)
          expect(aheadM).toBeGreaterThanOrEqual(groundAheadOf(bare, framing.leadShare))
          if (wide < cap * zoom) {
            const warnM = framing.feltSpeed * SPEED_FRAMING.warnSeconds
            expect(aheadM).toBeGreaterThanOrEqual(warnM * 0.999)
          }
        }
      }
    }
  })

  it('reports the grown collider’s share of the view to the debug API', () => {
    const bare = cameraViewOf(1280, 720, 12).vehicleColliderShare
    const wide = cameraViewOf(1280, 720, 12 * widthZoomOf(halfSideAt(3)), halfSideAt(3))
    expect(wide.vehicleColliderShare).toBeCloseTo(bare, 12)
  })
})
