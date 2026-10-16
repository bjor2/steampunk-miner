/**
 * The client side of `reportPose` (decision #11 amendments): the shell quantises the pose to
 * integer mm, mm/s and a 1024-scaled up vector before the command is built, so the authority and
 * `commands.ndjson` hold integers only. Action tick counts add up every fixed step between
 * reports; a report goes out at most every 12 ticks (5 per second), or at the reporter's drill
 * interval while drill ticks wait to be reported (ticket 514: every tick on the flag-off path), and
 * never repeats an identical pose with all-zero counts. The drive pushed at the report rides along
 * as signs (ticket 279).
 */
import {
  DRILL_POSE_REPORT_INTERVAL_TICKS,
  POSE_REPORT_INTERVAL_TICKS,
} from '../../constants/balance'
import type { DevFlags } from '../../constants/devFlags'
import { MM_PER_METRE, UP_VECTOR_SCALE } from '../../constants/physics'
import type { CommandPayloads } from '../authority/authorityCommand'
import type { Vector2 } from './localFrame'
import type { DriveSigns } from './driveSigns'
import type { Facing, VehiclePose } from './vehiclePose'

export interface ActionFlags {
  isDriving: boolean
  isThrusting: boolean
  isDrilling: boolean
}

export interface ActionTicks {
  thrustTicks: number
  driveTicks: number
  drillTicks: number
}

export interface PoseReporter {
  counts: ActionTicks
  lastSentPose: VehiclePose | null
  lastSentTick: number | null
  /** Ticks between reports while drill ticks wait to be reported. */
  drillIntervalTicks: number
}

export type PosePayload = CommandPayloads['reportPose']

const NO_TICKS: ActionTicks = { thrustTicks: 0, driveTicks: 0, drillTicks: 0 }

/** A reporter that has sent nothing yet, reporting every `drillIntervalTicks` while drilling. */
export function createPoseReporter(drillIntervalTicks: number): PoseReporter {
  return { counts: NO_TICKS, lastSentPose: null, lastSentTick: null, drillIntervalTicks }
}

/** The same reporter after a tow or a planet change: nothing sent, the same cadence. */
export function restartPoseReporter(reporter: PoseReporter): PoseReporter {
  return createPoseReporter(reporter.drillIntervalTicks)
}

/**
 * The drill interval the loop's flags give (ticket 514): every tick on the flag-off path, unless
 * the kill-switch `drill.reportEveryTick` is off; the swept path keeps 12, byte-identical (Q6).
 */
export function drillReportIntervalOf(flags: DevFlags): number {
  return isReportedEveryDrillTick(flags)
    ? DRILL_POSE_REPORT_INTERVAL_TICKS
    : POSE_REPORT_INTERVAL_TICKS
}

function isReportedEveryDrillTick(flags: DevFlags): boolean {
  return flags['drill.reportEveryTick'] && !flags['drill.sweptCut']
}

export function quantisePose(
  position: Vector2,
  velocity: Vector2,
  up: Vector2,
  facing: Facing,
): VehiclePose {
  return {
    x: Math.round(position.x * MM_PER_METRE),
    y: Math.round(position.y * MM_PER_METRE),
    vx: Math.round(velocity.x * MM_PER_METRE),
    vy: Math.round(velocity.y * MM_PER_METRE),
    upx: Math.round(up.x * UP_VECTOR_SCALE),
    upy: Math.round(up.y * UP_VECTOR_SCALE),
    facing,
  }
}

/** Adds one fixed step's actions to the counts the next report carries. */
export function countActionStep(reporter: PoseReporter, flags: ActionFlags): PoseReporter {
  const { counts } = reporter
  return {
    ...reporter,
    counts: {
      thrustTicks: counts.thrustTicks + (flags.isThrusting ? 1 : 0),
      driveTicks: counts.driveTicks + (flags.isDriving ? 1 : 0),
      drillTicks: counts.drillTicks + (flags.isDrilling ? 1 : 0),
    },
  }
}

/** What the vehicle does at the moment of a report: its action flags and the drive pushed. */
export interface ReportMoment {
  flags: ActionFlags
  drive: DriveSigns
}

/** The report due at `tick`, if any, and the reporter after sending it. */
export function takePoseReport(
  reporter: PoseReporter,
  pose: VehiclePose,
  { flags, drive }: ReportMoment,
  tick: number,
): { reporter: PoseReporter; payload: PosePayload | null } {
  if (!isReportDue(reporter, pose, tick)) return { reporter, payload: null }
  return {
    reporter: { ...reporter, counts: NO_TICKS, lastSentPose: pose, lastSentTick: tick },
    payload: {
      ...pose,
      driving: flags.isDriving,
      thrusting: flags.isThrusting,
      drilling: flags.isDrilling,
      ...reporter.counts,
      drive,
    },
  }
}

function isReportDue(reporter: PoseReporter, pose: VehiclePose, tick: number): boolean {
  const isIntervalOver =
    reporter.lastSentTick === null || tick - reporter.lastSentTick >= reportIntervalOf(reporter)
  return (
    isIntervalOver &&
    (hasCountedActions(reporter.counts) || !isSamePose(reporter.lastSentPose, pose))
  )
}

/** The fixed tick reads the cadence, never the frame clock, so render rate cannot move it. */
function reportIntervalOf(reporter: PoseReporter): number {
  return reporter.counts.drillTicks > 0 ? reporter.drillIntervalTicks : POSE_REPORT_INTERVAL_TICKS
}

function hasCountedActions(counts: ActionTicks): boolean {
  return counts.thrustTicks + counts.driveTicks + counts.drillTicks > 0
}

function isSamePose(a: VehiclePose | null, b: VehiclePose): boolean {
  if (a === null) return false
  return (
    a.x === b.x &&
    a.y === b.y &&
    a.vx === b.vx &&
    a.vy === b.vy &&
    a.upx === b.upx &&
    a.upy === b.upy &&
    a.facing === b.facing
  )
}
