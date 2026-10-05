/**
 * The swivelling drill head (decision #7 "Facing"): one of 4 local facings, the latest pushed
 * direction sets the target, and the head turns there over `SWIVEL_TICKS` fixed steps. The body
 * never rotates for it. Until the turn completes the drill still points the old way, so the
 * facing the authority hears about is the settled one.
 */
import { SWIVEL_TICKS } from '../../constants/balance'
import type { Facing } from './vehiclePose'

export interface DrillHead {
  from: Facing
  to: Facing
  /** Fixed steps left until the head points at `to`. */
  ticksLeft: number
}

export function newDrillHead(facing: Facing): DrillHead {
  return { from: facing, to: facing, ticksLeft: 0 }
}

/** One fixed step: a new pushed direction restarts the turn from where the drill points now. */
export function stepDrillHead(head: DrillHead, pushed: Facing | null): DrillHead {
  if (pushed !== null && pushed !== head.to) {
    return { from: settledFacingOf(head), to: pushed, ticksLeft: SWIVEL_TICKS }
  }
  return { ...head, ticksLeft: Math.max(0, head.ticksLeft - 1) }
}

export function settledFacingOf(head: DrillHead): Facing {
  return head.ticksLeft === 0 ? head.to : head.from
}

export function isHeadSettled(head: DrillHead): boolean {
  return head.ticksLeft === 0
}

/** How far through the turn the head is, 0 to 1, for drawing it. */
export function swivelProgressOf(head: DrillHead): number {
  return 1 - head.ticksLeft / SWIVEL_TICKS
}
