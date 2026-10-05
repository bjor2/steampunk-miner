import { describe, expect, it } from 'vitest'
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
const IDLE: ActionFlags = { isDriving: false, isThrusting: false, isDrilling: false }

/** Drives along x at 3 m/s for `ticks` fixed steps, collecting every report sent. */
function driveAndReport(ticks: number, flags: ActionFlags = DRIVING) {
  let reporter: PoseReporter = NEW_POSE_REPORTER
  const sent: { tick: number; payload: PosePayload }[] = []
  for (let tick = 1; tick <= ticks; tick++) {
    reporter = countActionStep(reporter, flags)
    const x = flags.isDriving ? (3 * tick) / 60 : 0
    const pose = quantisePose({ x, y: 300.5 }, { x: 3, y: 0 }, { x: 0, y: 1 }, FACING.right)
    const report = takePoseReport(reporter, pose, flags, tick)
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

  it('carry exactly the fixed steps each action was active, none lost or counted twice', () => {
    const sent = driveAndReport(600)
    const reported = sent.reduce((total, report) => total + report.payload.driveTicks, 0)
    expect(reported + sent.pending.driveTicks).toBe(600)
  })

  it('are not sent again for an identical pose with no actions', () => {
    expect(driveAndReport(600, IDLE)).toHaveLength(1)
  })

  it('hold integers and booleans only', () => {
    for (const { payload } of driveAndReport(120)) {
      for (const value of Object.values(payload)) {
        expect(typeof value === 'boolean' || Number.isSafeInteger(value)).toBe(true)
      }
    }
  })

  it('are left out of the zone test beyond 65535 mm', () => {
    expect(isWithinZoneTestRange(65535, 0)).toBe(true)
    expect(isWithinZoneTestRange(65536, 0)).toBe(false)
    expect(isWithinZoneTestRange(50000, 50000)).toBe(false)
  })
})
