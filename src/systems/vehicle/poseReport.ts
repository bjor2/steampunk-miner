/**
 * The client side of `reportPose` (decision #11 amendments): the shell quantises the pose to
 * integer mm, mm/s and a 1024-scaled up vector before the command is built, so the authority and
 * `commands.ndjson` hold integers only. Action tick counts add up every fixed step between
 * reports; a report goes out at most every 12 ticks (5 per second) and never repeats an identical
 * pose with all-zero counts.
 */
import { POSE_REPORT_INTERVAL_TICKS } from '../../constants/balance'
import { MM_PER_METRE, UP_VECTOR_SCALE } from '../../constants/physics'
import type { CommandPayloads } from '../authority/authorityCommand'
import type { Vector2 } from './localFrame'
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
}

export type PosePayload = CommandPayloads['reportPose']

const NO_TICKS: ActionTicks = { thrustTicks: 0, driveTicks: 0, drillTicks: 0 }

export const NEW_POSE_REPORTER: PoseReporter = {
  counts: NO_TICKS,
  lastSentPose: null,
  lastSentTick: null,
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

/** The report due at `tick`, if any, and the reporter after sending it. */
export function takePoseReport(
  reporter: PoseReporter,
  pose: VehiclePose,
  flags: ActionFlags,
  tick: number,
): { reporter: PoseReporter; payload: PosePayload | null } {
  if (!isReportDue(reporter, pose, tick)) return { reporter, payload: null }
  return {
    reporter: { counts: NO_TICKS, lastSentPose: pose, lastSentTick: tick },
    payload: {
      ...pose,
      driving: flags.isDriving,
      thrusting: flags.isThrusting,
      drilling: flags.isDrilling,
      ...reporter.counts,
    },
  }
}

function isReportDue(reporter: PoseReporter, pose: VehiclePose, tick: number): boolean {
  const isIntervalOver =
    reporter.lastSentTick === null || tick - reporter.lastSentTick >= POSE_REPORT_INTERVAL_TICKS
  return (
    isIntervalOver &&
    (hasCountedActions(reporter.counts) || !isSamePose(reporter.lastSentPose, pose))
  )
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
