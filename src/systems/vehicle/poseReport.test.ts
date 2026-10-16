import { describe, expect, it } from 'vitest'
import { NO_DRIVE, type DriveSigns } from './driveSigns'
import { FACING, isWithinZoneTestRange } from './vehiclePose'
import {
  countActionStep,
  NEW_POSE_REPORTER,
  quantisePose,
  takePoseReport,
  type ActionFlags,
  type PosePayload,
  type PoseReporter,
} from './poseReport'

const DRIVING: ActionFlags = { isDriving: true, isThrusting: false, isDrilling: false }
const THRUSTING: ActionFlags = { isDriving: false, isThrusting: true, isDrilling: false }
const DRILLING: ActionFlags = { isDriving: true, isThrusting: false, isDrilling: true }
const IDLE: ActionFlags = { isDriving: false, isThrusting: false, isDrilling: false }

/** Drives along x at 3 m/s for `ticks` fixed steps, collecting every report sent. */
function driveAndReport(ticks: number, flags: ActionFlags = DRIVING, drive: DriveSigns = NO_DRIVE) {
  return reportAlong(ticks, () => flags, drive)
}

/** `ticks` fixed steps with the actions `flagsAt` each tick, moving at 3 m/s while driving. */
function reportAlong(
  ticks: number,
  flagsAt: (tick: number) => ActionFlags,
  drive: DriveSigns = NO_DRIVE,
) {
  let reporter: PoseReporter = NEW_POSE_REPORTER
  const sent: { tick: number; payload: PosePayload }[] = []
  for (let tick = 1; tick <= ticks; tick++) {
    const flags = flagsAt(tick)
    reporter = countActionStep(reporter, flags)
    const x = flags.isDriving ? (3 * tick) / 60 : 0
    const pose = quantisePose({ x, y: 300.5 }, { x: 3, y: 0 }, { x: 0, y: 1 }, FACING.right)
    const report = takePoseReport(reporter, pose, { flags, drive }, tick)
    reporter = report.reporter
    if (report.payload !== null) sent.push({ tick, payload: report.payload })
  }
  return Object.assign(sent, { pending: reporter.counts })
}

describe('pose reports', () => {
  it('quantise position to mm, velocity to mm/s and the up vector to 1024', () => {
    const pose = quantisePose(
      { x: 1.23456, y: -2.5 },
      { x: 0.0004, y: -15.9996 },
      { x: 0.6, y: 0.8 },
      2,
    )
    expect(pose).toEqual({ x: 1235, y: -2500, vx: 0, vy: -16000, upx: 614, upy: 819, facing: 2 })
  })

  it('go out at most 5 times a second while moving', () => {
    const sent = driveAndReport(600)
    expect(sent.length).toBeLessThanOrEqual(50)
    sent
      .slice(1)
      .forEach((report, index) => expect(report.tick - sent[index].tick).toBeGreaterThanOrEqual(12))
  })

  it('go out every tick while the drill bites (ticket 514)', () => {
    const sent = driveAndReport(120, DRILLING)
    expect(sent.map(({ tick }) => tick)).toEqual(Array.from({ length: 120 }, (_, i) => i + 1))
    for (const { payload } of sent) expect(payload.drillTicks).toBe(1)
  })

  it('keep 12 ticks apart for thrust or drive alone', () => {
    for (const flags of [DRIVING, THRUSTING]) {
      const ticks = driveAndReport(120, flags).map(({ tick }) => tick)
      expect(ticks).toEqual([1, 13, 25, 37, 49, 61, 73, 85, 97, 109])
    }
  })

  it('send the first drill tick after an idle spell at once', () => {
    const sent = reportAlong(150, (tick) => (tick < 100 ? IDLE : DRILLING))
    expect(sent.map(({ tick }) => tick).slice(0, 3)).toEqual([1, 100, 101])
  })

  it('fall back to 12 ticks once the drill stops biting', () => {
    const sent = reportAlong(150, (tick) => (tick <= 40 ? DRILLING : DRIVING))
    const after = sent.map(({ tick }) => tick).filter((tick) => tick > 40)
    expect(after).toEqual([52, 64, 76, 88, 100, 112, 124, 136, 148])
  })

  it('carry every drill tick across the switch between cadences, none lost or counted twice', () => {
    const flagsAt = (tick: number) => (tick % 50 < 20 ? DRILLING : DRIVING)
    const sent = reportAlong(600, flagsAt)
    const reported = sent.reduce((total, report) => total + report.payload.drillTicks, 0)
    const drilled = Array.from({ length: 600 }, (_, i) => flagsAt(i + 1)).filter(
      (flags) => flags.isDrilling,
    ).length
    expect(reported + sent.pending.drillTicks).toBe(drilled)
  })

  it('carry exactly the fixed steps each action was active, none lost or counted twice', () => {
    const sent = driveAndReport(600)
    const reported = sent.reduce((total, report) => total + report.payload.driveTicks, 0)
    expect(reported + sent.pending.driveTicks).toBe(600)
  })

  it('are not sent again for an identical pose with no actions', () => {
    expect(driveAndReport(600, IDLE)).toHaveLength(1)
  })

  it('hold integers and booleans only, besides the drive signs', () => {
    for (const { payload } of driveAndReport(120)) {
      const { drive, ...rest } = payload
      for (const value of Object.values(rest)) {
        expect(typeof value === 'boolean' || Number.isSafeInteger(value)).toBe(true)
      }
      expect(drive).toEqual(NO_DRIVE)
    }
  })

  it('carry the drive pushed at the moment of the report', () => {
    const pushing: DriveSigns = { x: -1, y: -1 }
    for (const { payload } of driveAndReport(120, DRIVING, pushing)) {
      expect(payload.drive).toEqual(pushing)
    }
  })

  it('are left out of the zone test beyond 65535 mm', () => {
    expect(isWithinZoneTestRange(65535, 0)).toBe(true)
    expect(isWithinZoneTestRange(65536, 0)).toBe(false)
    expect(isWithinZoneTestRange(50000, 50000)).toBe(false)
  })
})
