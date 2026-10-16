import { describe, expect, it } from 'vitest'
import { VIEW_SHORT_AXIS_DEFAULT_M, VIEW_SHORT_AXIS_MIN_M } from '../../constants/scene'
import type { Vector2 } from '../vehicle/localFrame'
import {
  createSpeedFraming,
  framedShortAxisOf,
  groundAheadOf,
  horizontalGroundAheadOf,
  leadOffsetInto,
  leadShareOf,
  sideLeadShareOf,
  speedViewOf,
  stepSpeedFraming,
  type FramedView,
  type SpeedFraming,
} from './speedFraming'
import { maxViewVerticalOf, viewHorizontalMetresOf } from './viewZoom'

const DOWN = { x: 0, y: -1 }
const CAP_16_9 = maxViewVerticalOf(1920, 1080)

/** Drives the rig down at `speedOf(t)` cells a second for `seconds` of frames. */
function driveDown(
  framing: SpeedFraming,
  seconds: number,
  framesPerSecond: number,
  speedOf: (t: number) => number,
  onFrame: (framing: SpeedFraming) => void = () => {},
): SpeedFraming {
  const dt = 1 / framesPerSecond
  for (let frame = 0; frame < Math.round(seconds * framesPerSecond); frame++) {
    const speed = speedOf(frame * dt)
    stepSpeedFraming(framing, { x: 0, y: -speed }, DOWN, dt)
    onFrame(framing)
  }
  return framing
}

function steadyAt(speed: number, framesPerSecond = 60): SpeedFraming {
  return driveDown(createSpeedFraming(), 10, framesPerSecond, () => speed)
}

/** Drives the rig along `ahead` at a steady `speed` for 10 s of 60 fps frames. */
function steadyAlong(ahead: Vector2, speed: number): SpeedFraming {
  const framing = createSpeedFraming()
  for (let frame = 0; frame < 600; frame++) {
    stepSpeedFraming(framing, { x: ahead.x * speed, y: ahead.y * speed }, ahead, 1 / 60)
  }
  return framing
}

/** The view a `width` x `height` screen frames at `verticalMetres`, rolled by `turnRadians`. */
function viewOn(
  width: number,
  height: number,
  verticalMetres: number,
  turnRadians = 0,
): FramedView {
  const horizontalMetres = viewHorizontalMetresOf(width, height, verticalMetres)
  return { verticalMetres, horizontalMetres, turnRadians }
}

function leadOf(framing: SpeedFraming, view: FramedView): Vector2 {
  return leadOffsetInto({ x: 0, y: 0 }, framing, view)
}

/** A world offset as the rolled camera shows it: across (right) and up the screen. */
function onScreen(offset: Vector2, turnRadians: number): { across: number; up: number } {
  const cos = Math.cos(turnRadians)
  const sin = Math.sin(turnRadians)
  return { across: offset.x * cos + offset.y * sin, up: offset.y * cos - offset.x * sin }
}

/** On for half a second, off for half a second (the #316 stop-start acceptance). */
function stopStart(speed: number): (t: number) => number {
  return (t) => (t % 1 < 0.5 ? speed : 0)
}

describe('speed framing (#316 camera lock)', () => {
  it.each([0, 1, 3, 6, 8, 10, 12, 14, 15.9])(
    'keeps at least 1 s of ground ahead at a felt %d cells/s on a 16:9 screen',
    (speed) => {
      for (const playerZoom of [VIEW_SHORT_AXIS_MIN_M, VIEW_SHORT_AXIS_DEFAULT_M]) {
        const framing = steadyAt(speed)
        const shortAxis = framedShortAxisOf(framing, playerZoom, CAP_16_9)
        expect(groundAheadOf(shortAxis, framing.leadShare)).toBeGreaterThanOrEqual(
          framing.feltSpeed * 1 - 1e-9,
        )
      }
    },
  )

  it('never frames under the player zoom nor over the screen shape cap, at any speed', () => {
    for (const speed of [0, 2, 5, 9, 16, 40, 1000]) {
      for (const playerZoom of [8, 12, 20]) {
        driveDown(
          createSpeedFraming(),
          4,
          60,
          () => speed,
          (framing) => {
            const shortAxis = framedShortAxisOf(framing, playerZoom, CAP_16_9)
            expect(shortAxis).toBeGreaterThanOrEqual(Math.min(playerZoom, CAP_16_9))
            expect(shortAxis).toBeLessThanOrEqual(CAP_16_9)
          },
        )
      }
    }
  })

  it.each([4, 8, 12, 16, 24])(
    'changes the short axis by at most 5% in a stop-start dig at %d cells/s',
    (speed) => {
      const framing = driveDown(createSpeedFraming(), 10, 60, stopStart(speed))
      const shown: number[] = []
      driveDown(framing, 5, 60, stopStart(speed), (each) =>
        shown.push(framedShortAxisOf(each, 8, CAP_16_9)),
      )
      expect(Math.max(...shown) / Math.min(...shown)).toBeLessThanOrEqual(1.05)
    },
  )

  it('feels the same speed and pulls back the same at 30 and 144 frames per second', () => {
    const slow = driveDown(createSpeedFraming(), 1.5, 30, () => 12)
    const fast = driveDown(createSpeedFraming(), 1.5, 144, () => 12)
    expect(fast.feltSpeed).toBeCloseTo(slow.feltSpeed, 6)
    expect(fast.leadShare).toBeCloseTo(slow.leadShare, 2)
    expect(fast.pullBack).toBeCloseTo(slow.pullBack, 1)
  })

  it('leans the camera ahead along the drive, by at most 0.6 of the half short axis', () => {
    const framing = steadyAt(30)
    expect(framing.leadShare).toBeCloseTo(0.6, 6)
    const lead = leadOf(framing, viewOn(1920, 1080, 20))
    expect(lead.y).toBeCloseTo(-6, 3)
    expect(lead.x).toBeCloseTo(0, 6)
  })

  it('does not lean below 3 cells/s and leans 0.6 from 10.2 cells/s', () => {
    expect(leadShareOf(3)).toBe(0)
    expect(leadShareOf(9)).toBeCloseTo(0.5, 9)
    expect(leadShareOf(10.2)).toBeCloseTo(0.6, 9)
  })

  it('feels nothing while the rig drives away from its drill', () => {
    const framing = createSpeedFraming()
    for (let frame = 0; frame < 120; frame++) {
      stepSpeedFraming(framing, { x: 0, y: 12 }, DOWN, 1 / 60)
    }
    expect(framing.feltSpeed).toBe(0)
    expect(framing.pullBack).toBe(0)
  })

  it('holds the pull-back for 1 s after the rig stops, then eases back to the player zoom', () => {
    const framing = steadyAt(16)
    const pulledBack = framing.pullBack
    driveDown(framing, 0.95, 60, () => 0)
    expect(framing.pullBack).toBe(pulledBack)
    driveDown(framing, 3, 60, () => 0)
    expect(framedShortAxisOf(framing, 12, CAP_16_9)).toBe(12)
  })
})

const PORTRAIT_CELLS = [
  [390, 844],
  [412, 915],
  [820, 1180],
] as const
const RIGHT = { x: 1, y: 0 }
const DIAGONAL = { x: Math.SQRT1_2, y: -Math.SQRT1_2 }

describe('the lean in portrait (ticket 484)', () => {
  it('the horizontal lead reaches 0.6 of the half width at 5.6 m/s in portrait and the vertical lead is unchanged', () => {
    expect(sideLeadShareOf(3)).toBe(0)
    expect(sideLeadShareOf(4.3)).toBeCloseTo(0.3, 9)
    expect(sideLeadShareOf(5.6)).toBeCloseTo(0.6, 9)
    expect(sideLeadShareOf(40)).toBe(0.6)
    const portrait = viewOn(390, 844, 12)
    const across = leadOf(steadyAlong(RIGHT, 5.6), portrait)
    expect(across.x).toBeCloseTo(0.6 * (portrait.horizontalMetres / 2), 6)
    const descent = steadyAlong(DOWN, 5.6)
    expect(leadOf(descent, portrait).y).toBeCloseTo(-leadShareOf(5.6) * 6, 6)
    expect(leadOf(descent, portrait).y).toBeCloseTo(leadOf(descent, viewOn(1920, 1080, 12)).y, 9)
  })

  it('the rig stays at least 0.4 of the half width from the trailing edge at full lean', () => {
    for (const [width, height] of PORTRAIT_CELLS) {
      for (const turnRadians of [0, 0.4, Math.PI / 2, 2.5, -1]) {
        for (const ahead of [RIGHT, DOWN, DIAGONAL, { x: -0.6, y: 0.8 }]) {
          const view = viewOn(width, height, 12, turnRadians)
          const lead = onScreen(leadOf(steadyAlong(ahead, 30), view), turnRadians)
          const halfWidth = view.horizontalMetres / 2
          expect(halfWidth - Math.abs(lead.across)).toBeGreaterThanOrEqual(0.4 * halfWidth - 1e-9)
          expect(6 - Math.abs(lead.up)).toBeGreaterThanOrEqual(0.4 * 6 - 1e-9)
        }
      }
    }
  })

  it('the landscape lead offsets are unchanged', () => {
    for (const [width, height] of [
      [1920, 1080],
      [2560, 1080],
      [844, 390],
      [1180, 820],
    ]) {
      for (const ahead of [RIGHT, DOWN, DIAGONAL]) {
        const framing = steadyAlong(ahead, 8)
        const view = viewOn(width, height, 14, 1.2)
        const lead = leadOf(framing, view)
        expect(lead.x).toBe(framing.leadShare * (14 / 2) * framing.leadDirection.x)
        expect(lead.y).toBe(framing.leadShare * (14 / 2) * framing.leadDirection.y)
      }
    }
  })

  it('the horizontal ground ahead in portrait is half the width times one plus f', () => {
    const portrait = viewOn(390, 844, 12)
    const halfWidth = portrait.horizontalMetres / 2
    const lean = { leadShare: 0.25, sideLeadShare: 0.6 }
    expect(horizontalGroundAheadOf(portrait, lean)).toBeCloseTo(halfWidth * 1.6, 9)
    const view = speedViewOf(portrait, 6, lean)
    expect(view.groundAheadHorizontalMetres).toBeCloseTo(halfWidth * 1.6, 9)
    expect(view.groundAheadMetres).toBe(groundAheadOf(12, 0.25))
  })

  it('logs the horizontal cells ahead and warning seconds per speed row on the portrait cells (ticket 484)', () => {
    // A measurement, never pass or fail (Gameplay's condition 3 on #484): the shortfalls are logged.
    const rows: string[] = []
    for (const speed of [3, 6, 10, 15, 25, 44, 78]) {
      const framing = steadyAlong(RIGHT, speed)
      const desktop = horizontalAheadAt(framing, 1920, 1080)
      for (const [width, height] of PORTRAIT_CELLS) {
        const portrait = horizontalAheadAt(framing, width, height)
        const ratio = (desktop / portrait).toFixed(2)
        const warning = (portrait / speed).toFixed(2)
        rows.push(`${width}x${height} ${speed} m/s: ${ratio}x fewer cells ahead, ${warning} s`)
      }
    }
    console.log(`horizontal look-ahead in portrait (ticket 484)\n${rows.join('\n')}`)
    expect(rows).toHaveLength(21)
  })
})

/** Metres of ground ahead of a drive across a `width` x `height` screen framed by `framing`. */
function horizontalAheadAt(framing: SpeedFraming, width: number, height: number): number {
  const shown = Math.min(VIEW_SHORT_AXIS_DEFAULT_M, maxViewVerticalOf(width, height))
  const vertical = framedShortAxisOf(framing, shown, maxViewVerticalOf(width, height))
  return horizontalGroundAheadOf(viewOn(width, height, vertical), framing)
}
