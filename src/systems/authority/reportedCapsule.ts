/**
 * The report capsule (ticket 537, A7 "carve geometry at interval 1": the TD shape 6228947744
 * section 4 with the Horizontal Scaler's additions, approved by the GD 6234994053, bounded to
 * interval 1 by the GD's ruling after the prototype round 6241320435). A pose report at interval
 * 1 (`DRILL_POSE_REPORT_INTERVAL_TICKS`, live only while the authority charges the report cut
 * exactly, `drill.exactCarry`, TD 6236464931) carves the capsule from the previous reported pose's
 * stamp to this one's, in place of the bare disc at the pose, when the bite runs on unbroken: the
 * drill ran the one tick since the report the vehicle was last charged at (`command.tick -
 * accountedTick` is the drill ticks, as `reportedGateBite.ts` reads a running bite) on the same
 * facing. A report every tick then cuts the swept cut's shape between consecutive poses
 * (`stampShape.ts`'s capsule, the tail on the segment's start), so the rim between two discs no
 * longer stands. A 12-tick report, or any other interval, cuts protocol 86's bare disc byte for
 * byte (finding 2 of the prototype round), so the flag-off game never carves a capsule.
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
 * - **The gear's cells cut on every tick of the running bite** (HS finding 1, 6241316938): a tick
 *   in which no new sample enters the capsule removes nothing under the disc, and the gear's cells
 *   are cut all the same, never lost; the bare disc's cells are cut only with the bit, as before.
 * - **The clock**: the capsule is counted on the swept cut's sub-step clock, so a cell is not
 *   rounded up to the next whole tick, and charged as the report's bare disc is charged under the
 *   exact carry: the law work it removed with the carry (A6).
 * - Behind the authority dev flag `drill.reportCapsule` (on); off, the report's cut is protocol 86's.
 */
import { DRILL_POSE_REPORT_INTERVAL_TICKS } from '../../constants/balance'
import type { AuthorityDevFlags } from '../../constants/devFlags'
import { drillStampOf } from '../vehicle/drillStamp'
import type { Facing, VehiclePose } from '../vehicle/vehiclePose'
import type { VehicleState } from '../vehicle/vehicleState'
import type { CellsBesideCut } from '../world/groundEdit'
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

/**
 * What the report's own cut carves with: where its capsule starts (null: the bare disc), its
 * clock, and when its drill gear's cells are cut.
 */
export interface ReportedCutShape {
  tail: StampPoint | null
  clock: DrillClock
  cellsBeside: CellsBesideCut
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
  const tail = isCapsuleOn(flags) ? capsuleTailOf(report) : null
  if (tail === null) return { tail, clock: bareDiscClockOf(flags), cellsBeside: 'withBit' }
  return { tail, clock: CAPSULE_LAW_WORK_CLOCK, cellsBeside: 'everyTick' }
}

/** The capsule is live only with the exact carry, as interval 1 is (TD 6236464931). */
function isCapsuleOn(flags: AuthorityDevFlags): boolean {
  return flags['drill.reportCapsule'] && flags['drill.exactCarry']
}

/**
 * Where the report's capsule starts: the previous reported pose's stamp centre, when the bite runs
 * on unbroken at interval 1 and the step is within the cap; null for the bare disc.
 */
export function capsuleTailOf(report: CapsuleReport): StampPoint | null {
  const previous = report.before.pose
  if (previous === null || !isBiteRunningOn(report, previous.facing)) return null
  const stamp = drillStampOf(report.pose, report.isLifting)
  const tail = stampCentreAt(stamp, report.pose, previous)
  return isStepWithinCap(stamp, tail) ? tail : null
}

/**
 * Written at the last charged report one interval ago, the drill ran that one tick, and the
 * facing held: a 12-tick report or any other interval is never a running bite here.
 */
function isBiteRunningOn(
  { before, pose, tick, drillTicks }: CapsuleReport,
  previousFacing: Facing,
): boolean {
  const interval = tick - before.accountedTick
  return (
    interval === DRILL_POSE_REPORT_INTERVAL_TICKS &&
    drillTicks === interval &&
    pose.facing === previousFacing
  )
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
