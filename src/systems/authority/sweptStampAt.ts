/**
 * Where a swept tick's stamp sits (tickets 333, 334 and 570), split from `sweptDrill.ts`:
 *
 * - **Travelling** (the cut gate shut): a cutting step's bound ahead of the pose
 *   (`travelStampAheadMmAt`), as the body may cover more than the drill's step.
 * - **Cutting** (the gate open): at the front of this tick's step (`sweptStampAheadMmOf`), the step
 *   the drill law gives (`frontStepMmAt`), or on the first cutting tick after travel the body's own
 *   speed when that is more (`landingFrontStepMmOf`). A continuing cut's stamp never stands behind
 *   the cursor's reach, so the cut never walks back over ground it cut, nor past the last front by
 *   more than the step and the margin it may win back, so a body that keeps moving into its
 *   contact margin never drags the front far past the drill's own speed.
 */
import { CUT_FACE_MARGIN_MM } from '../../constants/balance'
import { UP_VECTOR_SCALE } from '../../constants/physics'
import { isCutGateOpen, type CutGate } from '../vehicle/cutGate'
import {
  cutFrontStepMmOf,
  cuttingDrillStampOf,
  landingFrontStepMmOf,
  sweptDrillStampOf,
  sweptStampAheadMmOf,
} from '../vehicle/drillStamp'
import { frontOfCursor, stampBodyPointOf, type SweptCut } from '../vehicle/sweptCut'
import { facingVectorOf, type VehiclePose } from '../vehicle/vehiclePose'
import { MM_PER_SAMPLE } from '../world/sampleGrid'
import type { DiscStamp, StampPoint } from '../world/stampShape'
import { vehicleOf, type AuthorityState } from './authorityState'
import { frontStepMmAt, type CutFollowStep } from './cutFollowRead'
import { cutGateLeftAt, stepBoundsAt, travelStampAheadMmAt } from './stepBoundRead'

/**
 * A step's stamp, how far ahead of the pose it was placed, the body point it pulls back to, the
 * point on the body's line a cutting step carves forward from (`rear`), and the front a
 * continuing cut left the tick before (`crossed`, `cutFront.ts`), null on a fresh one.
 */
export interface PlacedStamp {
  stamp: DiscStamp
  aheadMm: number
  bodyPoint: StampPoint
  rear: StampPoint
  crossed: StampPoint | null
}

/** A step to place a stamp for: its pose and lift, as the cut-follow read it, and its gate. */
export interface StampStep {
  pose: VehiclePose
  isLifting: boolean
  read: CutFollowStep
  gate: CutGate
}

export function sweptStampAt(
  state: AuthorityState,
  playerId: string,
  step: StampStep,
): PlacedStamp {
  const { pose, isLifting, gate } = step
  if (!isCutGateOpen(gate)) return placedTravellingAt(pose, isLifting, state, playerId)
  const stepMm = cutFrontStepMmAt(state, playerId, step)
  const aheadMm = sweptStampAheadMmOf(stepMm)
  const placed = placedAt(pose, cuttingDrillStampOf(pose, isLifting, aheadMm), aheadMm)
  const cursor = continuedCursorOf(state, playerId, pose)
  if (cursor === null) return placed
  const stamp = withinCursorReach(placed.stamp, { cursor, pose, stepMm })
  return { ...placed, stamp, rear: rearOfCut(placed, cursor), crossed: frontOfCursor(cursor) }
}

function placedTravellingAt(
  pose: VehiclePose,
  isLifting: boolean,
  state: AuthorityState,
  playerId: string,
): PlacedStamp {
  const aheadMm = travelStampAheadMmAt(state, playerId)
  return placedAt(pose, sweptDrillStampOf(pose, isLifting, aheadMm), aheadMm)
}

function placedAt(pose: VehiclePose, stamp: DiscStamp, aheadMm: number): PlacedStamp {
  const bodyPoint = stampBodyPointOf({ stamp, aheadMm }, pose)
  return { stamp, aheadMm, bodyPoint, rear: bodyPoint, crossed: null }
}

/**
 * Where a continuing cut carves forward from (ticket 570): the body, so ground the body slid or
 * fell beside is cut, but never further back than the stamp's radius behind the last front, as
 * the casing rings the cut lays (`casingRingLagMm`) all lie further back than that and the cut
 * must never take its own lining (#41, #56).
 */
function rearOfCut({ stamp, bodyPoint }: PlacedStamp, cursor: SweptCut): StampPoint {
  const line = { from: bodyPoint, to: stamp }
  const lastFront = pointOnLine(frontOfCursor(cursor), line)
  const ringFree = pointAlongLine(lastFront, line, -stamp.radiusMm)
  return alongLineOf(ringFree, line) > alongLineOf(bodyPoint, line) ? ringFree : bodyPoint
}

/** A line through two points, the second ahead of the first along the facing. */
interface Line {
  from: StampPoint
  to: StampPoint
}

/** The point projected onto the line, in whole mm. */
function pointOnLine(point: StampPoint, { from, to }: Line): StampPoint {
  const dx = to.xMm - from.xMm
  const dy = to.yMm - from.yMm
  const lengthSq = dx * dx + dy * dy
  if (lengthSq === 0) return from
  const along = (point.xMm - from.xMm) * dx + (point.yMm - from.yMm) * dy
  return {
    xMm: from.xMm + Math.round((dx * along) / lengthSq),
    yMm: from.yMm + Math.round((dy * along) / lengthSq),
  }
}

/** The point moved `mm` along the line's direction, in whole mm. */
function pointAlongLine(point: StampPoint, { from, to }: Line, mm: number): StampPoint {
  const dx = to.xMm - from.xMm
  const dy = to.yMm - from.yMm
  const length = Math.sqrt(dx * dx + dy * dy)
  if (length === 0) return point
  return {
    xMm: point.xMm + Math.round((dx * mm) / length),
    yMm: point.yMm + Math.round((dy * mm) / length),
  }
}

/** How far along the line's direction a point lies, from its first point, mm times its length. */
function alongLineOf(point: StampPoint, { from, to }: Line): number {
  return (point.xMm - from.xMm) * (to.xMm - from.xMm) + (point.yMm - from.yMm) * (to.yMm - from.yMm)
}

/** The front's step this tick: the law's, or a landing body's speed on the first after travel. */
function cutFrontStepMmAt(state: AuthorityState, playerId: string, step: StampStep): number {
  const { cuttingMm } = stepBoundsAt(state, playerId)
  const lawStepMm = frontStepMmAt(state, playerId, step.read)
  if (wasCuttingBefore(state, playerId)) return cutFrontStepMmOf(lawStepMm, cuttingMm)
  return landingFrontStepMmOf(step.pose, lawStepMm, cuttingMm)
}

/** The gate the cursor left the rig under at the tick before was open: a cut under way. */
function wasCuttingBefore(state: AuthorityState, playerId: string): boolean {
  const cursor = vehicleOf(state, playerId).sweptCut
  return isCutGateOpen(cutGateLeftAt(cursor, state.tick - 1))
}

/** The cursor this step continues (cut the tick before, the same facing), or null for a fresh one. */
function continuedCursorOf(
  state: AuthorityState,
  playerId: string,
  pose: VehiclePose,
): SweptCut | null {
  const cursor = vehicleOf(state, playerId).sweptCut
  if (cursor === undefined || cursor.tick !== state.tick - 1) return null
  return cursor.facing === pose.facing ? cursor : null
}

/**
 * How much further than its step a front may move on in a tick: the contact margin and the half
 * sample behind it, so a front that fell behind its body (a short tick, a ramp) wins its margin
 * back on the next, while a body pushing past its step drags it no faster than this.
 */
const FACE_CATCH_UP_MM = CUT_FACE_MARGIN_MM + MM_PER_SAMPLE / 2

/** The cursor a cutting stamp is held to, its pose, and the tick's front step. */
interface CursorReach {
  cursor: SweptCut
  pose: VehiclePose
  stepMm: number
}

/**
 * The stamp moved along the facing to lie no nearer than the cursor's reach and no further than
 * its last front plus the step.
 */
function withinCursorReach(stamp: DiscStamp, { cursor, pose, stepMm }: CursorReach): DiscStamp {
  const ahead = facingVectorOf(pose.upx, pose.upy, pose.facing)
  const alongOf = (point: StampPoint) =>
    (point.xMm - cursor.xMm) * ahead.x + (point.yMm - cursor.yMm) * ahead.y
  const along = alongOf(stamp)
  if (along < 0) return { ...stamp, xMm: cursor.xMm, yMm: cursor.yMm }
  const front = frontOfCursor(cursor)
  const furthest = alongOf(front) + (stepMm + FACE_CATCH_UP_MM) * scaleOf(ahead)
  if (along <= furthest) return stamp
  const back = Math.ceil((along - furthest) / scaleOf(ahead))
  return {
    ...stamp,
    xMm: stamp.xMm - aheadPart(ahead.x, back),
    yMm: stamp.yMm - aheadPart(ahead.y, back),
  }
}

/**
 * The cursor a cutting step's walk continues, moved across onto the body's line (ticket 570): its
 * reach along the facing kept, so the walk pays the cells under the body when the body slid aside
 * (centred on its tile by the bore offset), not the line it cut before. What the cut left between
 * the two lines lies in the bore it already cleared. A travelling step's cursor is left as it is.
 */
export function cursorOnBodyLine(
  cursor: SweptCut | undefined,
  { stamp, bodyPoint }: PlacedStamp,
  gate: CutGate,
): SweptCut | undefined {
  if (cursor === undefined || !isCutGateOpen(gate)) return cursor
  const { xMm, yMm } = pointOnLine(cursor, { from: bodyPoint, to: stamp })
  return { ...cursor, xMm, yMm }
}

/** The facing vector's length: its components are at `UP_VECTOR_SCALE`. */
function scaleOf(ahead: { x: number; y: number }): number {
  return Math.sqrt(ahead.x * ahead.x + ahead.y * ahead.y)
}

/** `mm` along the facing's component, in whole mm, rounded away from the front. */
function aheadPart(component: number, mm: number): number {
  return Math.ceil((component * mm) / UP_VECTOR_SCALE)
}
