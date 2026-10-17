/**
 * The report capsule (ticket 537, A7 "carve geometry at interval 1": the TD shape 6228947744
 * section 4 with the Horizontal Scaler's additions, approved by the GD 6234994053). A pose
 * report's own cut carves the capsule from the previous reported pose's stamp to this one's, in
 * place of the bare disc at the pose, when the bite runs on unbroken: the drill ran every tick
 * since the report the vehicle was last charged at (`command.tick - accountedTick` is the drill
 * ticks, as `reportedGateBite.ts` reads a running bite) on the same facing. A report every tick
 * then cuts the swept cut's shape between consecutive poses (`stampShape.ts`'s capsule, the tail
 * on the segment's start), so the rim between two discs no longer stands.
 *
 * - **The tail is the previous pose's stamp centre**: this report's stamp moved back by the step
 *   the pose took. No new state: the vehicle's pose before the report is the previous reported
 *   pose, and its lift and level floor are this report's (a bite that lifts mid-step is cut as
 *   lifting from its start).
 * - **The cap** (HS): the capsule is at most one stamp radius long. A longer step, a fresh bite, a
 *   turn and a still rig cut today's bare disc on today's whole-tick clock, byte for byte, so the
 *   240 and 3600 m/s rows stay the parked #441 and #439 bore-bar wiring, not this ticket's. The
 *   drill gear's heads are whole cells beside the stamp at the new pose, as before; they move with
 *   the body by the same step, so the cap on the step caps each head, and every cell the capsule
 *   crosses answers the drill's gates as the disc's cells do (the carve asks per cell).
 * - **The clock**: the capsule is counted on the swept cut's sub-step clock, so a cell is not
 *   rounded up to the next whole tick, and charged as the report's bare disc is charged: the ticks
 *   its stamp removed something in, or (`drill.exactCarry`) the law work it removed with the carry.
 * - Behind the authority dev flag `drill.reportCapsule` (on); off, the report's cut is protocol 86's.
 */
import type { AuthorityDevFlags } from '../../constants/devFlags'
import { drillStampOf } from '../vehicle/drillStamp'
import type { Facing, VehiclePose } from '../vehicle/vehiclePose'
import type { VehicleState } from '../vehicle/vehicleState'
import type { DiscStamp, StampPoint } from '../world/stampShape'
import { LAW_WORK_CLOCK, SUB_STEP_CLOCK, WHOLE_TICK_CLOCK, type DrillClock } from './groundDrill'

/** A pose report as the capsule reads it: the vehicle before it, and what the report said. */
export interface CapsuleReport {
  before: VehicleState
  pose: VehiclePose
  isLifting: boolean
  tick: number
  drillTicks: number
}

/** What the report's own cut carves with: where its capsule starts (null: the bare disc), and its clock. */
export interface ReportedCutShape {
  tail: StampPoint | null
  clock: DrillClock
}

/** The capsule on the sub-step clock, charged as the bare disc's whole ticks are. */
export const CAPSULE_TICK_CLOCK: DrillClock = {
  ...SUB_STEP_CLOCK,
  chargeOf: WHOLE_TICK_CLOCK.chargeOf,
}

/** The capsule on the sub-step clock, charged on the law work it removed with the carry (A6). */
export const CAPSULE_LAW_WORK_CLOCK: DrillClock = {
  ...SUB_STEP_CLOCK,
  lawTimesOf: LAW_WORK_CLOCK.lawTimesOf,
  chargeOf: LAW_WORK_CLOCK.chargeOf,
}

/** The report's cut shape under `flags`: the capsule where the bite runs on, else today's disc. */
export function reportedCutShapeOf(
  report: CapsuleReport,
  flags: AuthorityDevFlags,
): ReportedCutShape {
  const tail = flags['drill.reportCapsule'] ? capsuleTailOf(report) : null
  return { tail, clock: tail === null ? bareDiscClockOf(flags) : capsuleClockOf(flags) }
}

/**
 * Where the report's capsule starts: the previous reported pose's stamp centre, when the bite runs
 * on unbroken and the step is within the cap; null for the bare disc.
 */
export function capsuleTailOf(report: CapsuleReport): StampPoint | null {
  const previous = report.before.pose
  if (previous === null || !isBiteRunningOn(report, previous.facing)) return null
  const stamp = drillStampOf(report.pose, report.isLifting)
  const tail = stampCentreAt(stamp, report.pose, previous)
  return isStepWithinCap(stamp, tail) ? tail : null
}

/** Written at the last charged report, the drill ran every tick since, and the facing held. */
function isBiteRunningOn(
  { before, pose, tick, drillTicks }: CapsuleReport,
  previousFacing: Facing,
): boolean {
  const interval = tick - before.accountedTick
  return interval > 0 && drillTicks === interval && pose.facing === previousFacing
}

/** The stamp's centre had the pose been `previous`: moved back by the step the pose took. */
function stampCentreAt(stamp: DiscStamp, pose: VehiclePose, previous: VehiclePose): StampPoint {
  return { xMm: stamp.xMm - pose.x + previous.x, yMm: stamp.yMm - pose.y + previous.y }
}

/** A step longer than nothing and at most one stamp radius; squares of whole mm, no float decides it. */
function isStepWithinCap(stamp: DiscStamp, tail: StampPoint): boolean {
  const dx = stamp.xMm - tail.xMm
  const dy = stamp.yMm - tail.yMm
  const stepSq = dx * dx + dy * dy
  return stepSq > 0 && stepSq <= stamp.radiusMm * stamp.radiusMm
}

/** The clock the bare disc is charged on: the law work it removed, or whole ticks. */
function bareDiscClockOf(flags: AuthorityDevFlags): DrillClock {
  return flags['drill.exactCarry'] ? LAW_WORK_CLOCK : WHOLE_TICK_CLOCK
}

function capsuleClockOf(flags: AuthorityDevFlags): DrillClock {
  return flags['drill.exactCarry'] ? CAPSULE_LAW_WORK_CLOCK : CAPSULE_TICK_CLOCK
}
