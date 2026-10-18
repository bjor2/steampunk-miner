import { describe, expect, it } from 'vitest'
import {
  AUTHORITY_DEV_FLAGS,
  DEV_FLAGS,
  type AuthorityDevFlags,
  type DevFlags,
} from '../../constants/devFlags'
import { NO_DRIVE, type DriveSigns } from './driveSigns'
import { FACING, isWithinZoneTestRange } from './vehiclePose'
import {
  countActionStep,
  createPoseReporter,
  drillReportIntervalOf,
  quantisePose,
  restartPoseReporter,
  takePoseReport,
  type ActionFlags,
  type PosePayload,
  type PoseReporter,
} from './poseReport'

const DRIVING: ActionFlags = { isDriving: true, isThrusting: false, isDrilling: false }
const THRUSTING: ActionFlags = { isDriving: false, isThrusting: true, isDrilling: false }
const DRILLING: ActionFlags = { isDriving: true, isThrusting: false, isDrilling: true }
const IDLE: ActionFlags = { isDriving: false, isThrusting: false, isDrilling: false }

/** The authority with the report cut charged exactly, which turns on every-tick reports (ticket 514). */
const EXACT_CARRY_ON: AuthorityDevFlags = { ...AUTHORITY_DEV_FLAGS, 'drill.exactCarry': true }
/** The client with the swept cut off: the only path `drill.reportEveryTick` reads (every flag ships on since 18 Oct 2026). */
const SWEPT_CUT_OFF: DevFlags = { ...DEV_FLAGS, 'drill.sweptCut': false }
/** The loop's drill interval with the swept cut off and the exact carry on: a report every tick. */
const EVERY_TICK_INTERVAL = drillReportIntervalOf(SWEPT_CUT_OFF, EXACT_CARRY_ON)

/** Drives along x at 3 m/s for `ticks` fixed steps, collecting every report sent. */
function driveAndReport(ticks: number, flags: ActionFlags = DRIVING, drive: DriveSigns = NO_DRIVE) {
  return reportAlong(ticks, () => flags, drive)
}

/** `ticks` fixed steps with the actions `flagsAt` each tick, moving at 3 m/s while driving. */
function reportAlong(
  ticks: number,
  flagsAt: (tick: number) => ActionFlags,
  drive: DriveSigns = NO_DRIVE,
  drillIntervalTicks = EVERY_TICK_INTERVAL,
) {
  let reporter: PoseReporter = createPoseReporter(drillIntervalTicks)
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

/** Every on/off combination of `flags`' switches, so a new flag is covered the day it lands. */
function flagCombinationsOf<Flags extends DevFlags | AuthorityDevFlags>(flags: Flags): Flags[] {
  return Object.keys(flags).reduce<Flags[]>(
    (combinations, key) =>
      combinations.flatMap((combination) => [
        { ...combination, [key]: false },
        { ...combination, [key]: true },
      ]),
    [flags],
  )
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

  it('keep 12 ticks apart while drilling as the game ships, with the swept cut on', () => {
    expect(AUTHORITY_DEV_FLAGS['drill.exactCarry']).toBe(true)
    expect(DEV_FLAGS['drill.sweptCut']).toBe(true)
    const shipped = drillReportIntervalOf(DEV_FLAGS)
    expect(shipped).toBe(12)
    const ticks = reportAlong(120, () => DRILLING, NO_DRIVE, shipped).map(({ tick }) => tick)
    expect(ticks).toEqual([1, 13, 25, 37, 49, 61, 73, 85, 97, 109])
  })

  it('never report every drill tick with the exact carry off, whatever the other flags', () => {
    const exactCarryOff = flagCombinationsOf(AUTHORITY_DEV_FLAGS).filter(
      (authority) => !authority['drill.exactCarry'],
    )
    for (const flags of flagCombinationsOf(DEV_FLAGS)) {
      for (const authority of exactCarryOff) {
        expect(drillReportIntervalOf(flags, authority)).toBe(12)
      }
    }
  })

  it('report every drill tick on the swept-cut-off path only, once the exact carry is on', () => {
    expect(drillReportIntervalOf(SWEPT_CUT_OFF, EXACT_CARRY_ON)).toBe(1)
    expect(drillReportIntervalOf({ ...DEV_FLAGS, 'drill.sweptCut': true }, EXACT_CARRY_ON)).toBe(12)
  })

  it('keep 12 ticks apart while drilling with the kill-switch off, as before ticket 514', () => {
    const killed = drillReportIntervalOf(
      { ...SWEPT_CUT_OFF, 'drill.reportEveryTick': false },
      EXACT_CARRY_ON,
    )
    const ticks = reportAlong(120, () => DRILLING, NO_DRIVE, killed).map(({ tick }) => tick)
    expect(ticks).toEqual([1, 13, 25, 37, 49, 61, 73, 85, 97, 109])
  })

  it('keep 12 ticks apart while drilling with the swept cut on', () => {
    const swept = drillReportIntervalOf({ ...DEV_FLAGS, 'drill.sweptCut': true }, EXACT_CARRY_ON)
    const ticks = reportAlong(120, () => DRILLING, NO_DRIVE, swept).map(({ tick }) => tick)
    expect(ticks).toEqual([1, 13, 25, 37, 49, 61, 73, 85, 97, 109])
  })

  it('keep the drill cadence across a tow, with nothing sent since', () => {
    const towed = restartPoseReporter({ ...createPoseReporter(12), lastSentTick: 40 })
    expect(towed).toEqual(createPoseReporter(12))
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
