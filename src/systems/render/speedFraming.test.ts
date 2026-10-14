import { describe, expect, it } from 'vitest'
import { VIEW_SHORT_AXIS_DEFAULT_M, VIEW_SHORT_AXIS_MIN_M } from '../../constants/scene'
import {
  createSpeedFraming,
  framedShortAxisOf,
  groundAheadOf,
  leadOffsetOf,
  leadShareOf,
  stepSpeedFraming,
  type SpeedFraming,
} from './speedFraming'
import { maxViewShortAxisOf } from './viewZoom'

const DOWN = { x: 0, y: -1 }
const CAP_16_9 = maxViewShortAxisOf(1920, 1080)

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
    expect(leadOffsetOf(framing, 20, 'y')).toBeCloseTo(-6, 3)
    expect(leadOffsetOf(framing, 20, 'x')).toBeCloseTo(0, 6)
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
