/**
 * The swept cut's path (TD scope on #316, ticket 330), pure and integer: each `drillStep` sweeps
 * the drill's stamp from where the last step's cut reached (the vehicle's cursor) to the stamp at
 * the new pose, in sub-steps of at most `SWEEP_STEP_MM`.
 *
 * - A step continues the cursor's sweep only when the cursor was cut on the tick before, with the
 *   same facing. Otherwise it is fresh: its path runs from the body (the stamp pulled back along
 *   the facing by as far as it sits ahead) to the stamp, and it cuts a bare disc where it stops:
 *   with nothing in the way, a report's disc one cutting step further ahead (tickets 333, 334).
 * - A tick's cut clears at least the stamp's bore from the body to its reach, at any cells a tick
 *   (ticket 439, the TD shape on #397): once the bare disc where a fresh path stops would leave the
 *   body point uncovered, the path cuts the capsule from the body instead, as a continuing step
 *   cuts from its cursor. Otherwise the body's own cell and the rim along the path stay standing,
 *   and a rig past about a cell a tick rests on that lip at 0 m/s while its reach runs on.
 * - The stamp's centre is walked along the path (`carryWalk.ts`, ticket 399), and the sweep stops at
 *   the last sub-step before the centre would enter a cell the drill cannot cut (a gate that
 *   refuses or blocks it, or one past its scratch floor), or one its work cannot pay for yet.
 *   Cells are 1 m and the stamp's radius 0.95 m, so a centre that never
 *   enters such a cell never reaches the cells behind it: a fast tick never cuts past one, while
 *   the stamp still cuts every other cell up to its face. A fresh path whose body point is already
 *   in such a cell cuts nothing.
 */
import { DRILL_SUBSTEPS_PER_TICK } from '../../constants/balance'
import { UP_VECTOR_SCALE } from '../../constants/physics'
import type { DiscStamp, StampPoint } from '../world/stampShape'
import type { CutGate } from './cutGate'
import type { TilePoint } from '../world/tileGrid'
import { facingVectorOf, tileOfMillimetres, type Facing, type VehiclePose } from './vehiclePose'

/** The sub-step the sweep's front is walked in: half a density sample. */
export const SWEEP_STEP_MM = 125

/**
 * The vehicle's cursor: where the last drill step's cut reached (the next step's start), the
 * position that step reported (the next step's bound is measured from it), its facing and tick,
 * the cut gate as that step left it (ticket 333), what it left of its per-cell share for the
 * next player that tick (ticket 335, `cutShare.ts`), the dig time the steps since the last
 * charged report cut, in sub-steps, which that report heats from (ticket 335), and the work the
 * step carries toward its next cell, in sub-steps (ticket 399, `carryWalk.ts`), which only a step
 * continuing the cursor spends.
 */
export interface SweptCut extends StampPoint, CutGate {
  poseXMm: number
  poseYMm: number
  facing: Facing
  tick: number
  cutSharePassed: number
  digSubSteps: number
  carrySubSteps: number
}

/**
 * The cursor's dig time after a step that cut `added` sub-steps: added to the steps' since the last
 * charged report (`accountedTick`), or to what that report left of a whole tick (TD lock on #374:
 * heat comes from summed dig time, so overheat never becomes a hidden speed cap).
 */
export function digSubStepsAfter(
  cursor: SweptCut | undefined,
  accountedTick: number,
  added: number,
): number {
  if (cursor === undefined) return added
  const isSinceReport = cursor.tick > accountedTick
  return (isSinceReport ? cursor.digSubSteps : cursor.digSubSteps % DRILL_SUBSTEPS_PER_TICK) + added
}

/** The whole ticks of drilling a report heats for: the steps' summed dig time since the last. */
export function stepDigTicksOf(cursor: SweptCut): number {
  return Math.floor(cursor.digSubSteps / DRILL_SUBSTEPS_PER_TICK)
}

/** One step's path for the stamp's centre. */
export interface SweepPath {
  from: StampPoint
  to: StampPoint
  /** Not continuing a cursor: the step cuts a bare disc where it stops. */
  isFresh: boolean
  /** Sub-steps from `from` to `to`, at least 1. */
  steps: number
}

/** The stamp a step cuts with at its pose, sitting `aheadMm` ahead of it along the facing. */
export interface StepStamp {
  stamp: DiscStamp
  aheadMm: number
}

/** The path of a step at `tick` whose stamp at the new pose is `stepStamp`. */
export function sweepPathOf(
  cursor: SweptCut | undefined,
  pose: VehiclePose,
  stepStamp: StepStamp,
  tick: number,
): SweepPath {
  const { stamp } = stepStamp
  const isFresh = !isContinuing(cursor, pose, tick)
  const from = isFresh || cursor === undefined ? bodyPointOf(stepStamp, pose) : pointOf(cursor)
  const to = pointOf(stamp)
  return { from, to, isFresh, steps: stepsBetween(from, to) }
}

function isContinuing(cursor: SweptCut | undefined, pose: VehiclePose, tick: number): boolean {
  return cursor !== undefined && cursor.tick === tick - 1 && cursor.facing === pose.facing
}

/** The stamp pulled back along the facing to the body: where a fresh step's walk starts. */
function bodyPointOf({ stamp, aheadMm }: StepStamp, pose: VehiclePose): StampPoint {
  const ahead = facingVectorOf(pose.upx, pose.upy, pose.facing)
  return {
    xMm: stamp.xMm - scaled(ahead.x, aheadMm),
    yMm: stamp.yMm - scaled(ahead.y, aheadMm),
  }
}

function stepsBetween(from: StampPoint, to: StampPoint): number {
  const dx = to.xMm - from.xMm
  const dy = to.yMm - from.yMm
  return Math.max(1, Math.ceil(Math.sqrt(dx * dx + dy * dy) / SWEEP_STEP_MM))
}

/** The stamp's centre after `step` of the path's sub-steps (`steps` is `to`). */
export function pointAtStep(path: SweepPath, step: number): StampPoint {
  return {
    xMm: path.from.xMm + Math.floor(((path.to.xMm - path.from.xMm) * step) / path.steps),
    yMm: path.from.yMm + Math.floor(((path.to.yMm - path.from.yMm) * step) / path.steps),
  }
}

/** The tile under the stamp's centre at a sub-step. */
export function centreTileAtStep(path: SweepPath, step: number): TilePoint {
  const centre = pointAtStep(path, step)
  return tileOfMillimetres(centre.xMm, centre.yMm)
}

/**
 * The stamp the step cuts reaching `step`: a capsule from the path's start, or a fresh path's bare
 * disc while that disc still covers the body.
 */
export function sweptStampOf(path: SweepPath, stamp: DiscStamp, step: number): DiscStamp {
  const reached = pointAtStep(path, step)
  const tail = isBareDiscReach(path, reached, stamp.radiusMm) ? reached : path.from
  return { ...stamp, ...reached, tail }
}

/**
 * A fresh path whose reach is within one radius of the body point it starts from: the disc there
 * covers the body, so the cut stays the bare disc it was before ticket 439, byte for byte. Squares
 * of whole mm, so no float decides it.
 */
function isBareDiscReach(path: SweepPath, reached: StampPoint, radiusMm: number): boolean {
  const dx = reached.xMm - path.from.xMm
  const dy = reached.yMm - path.from.yMm
  return path.isFresh && dx * dx + dy * dy <= radiusMm * radiusMm
}

function pointOf({ xMm, yMm }: StampPoint): StampPoint {
  return { xMm, yMm }
}

/** A component of a 1024-scaled unit vector, times a length in mm, in whole mm. */
function scaled(component: number, lengthMm: number): number {
  return Math.floor((component * lengthMm) / UP_VECTOR_SCALE)
}
