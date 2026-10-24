/**
 * The swivelling drill head (decision #7 "Facing", analog since ticket 791): the latest pushed aim
 * sets the target, and the head turns there over `SWIVEL_TICKS` fixed steps. The body never
 * rotates for it. Until the turn completes the drill still points the old way, so the aim the
 * authority hears about is the settled one.
 *
 * An analog stick moves the aim a step or two at a time as the thumb sweeps. A push within
 * `AIM_TRACK_STEPS` of the head's target is tracked, not turned to: a settled head points there at
 * once, a turning one turns there instead, its count running on. A restart on every such nudge
 * would hold a sweeping head off its target for good. The keys' aims lie a quarter turn apart, so
 * a key always turns the head as it did.
 */
import { AIM_TRACK_STEPS, SWIVEL_TICKS } from '../../constants/balance'
import { aimTurnOf, type Aim } from './aim'

export interface DrillHead {
  from: Aim
  to: Aim
  /** Fixed steps left until the head points at `to`. */
  ticksLeft: number
}

export function newDrillHead(aim: Aim): DrillHead {
  return { from: aim, to: aim, ticksLeft: 0 }
}

/** One fixed step: a new pushed aim restarts the turn from where the drill points now. */
export function stepDrillHead(head: DrillHead, pushed: Aim | null): DrillHead {
  if (pushed === null || pushed === head.to) return turnedOn(head)
  if (isTrackedNudge(head, pushed)) return nudgedTo(head, pushed)
  return { from: settledAimOf(head), to: pushed, ticksLeft: SWIVEL_TICKS }
}

export function settledAimOf(head: DrillHead): Aim {
  return head.ticksLeft === 0 ? head.to : head.from
}

export function isHeadSettled(head: DrillHead): boolean {
  return head.ticksLeft === 0
}

/** How far through the turn the head is, 0 to 1, for drawing it. */
export function swivelProgressOf(head: DrillHead): number {
  return 1 - head.ticksLeft / SWIVEL_TICKS
}

function turnedOn(head: DrillHead): DrillHead {
  return { ...head, ticksLeft: Math.max(0, head.ticksLeft - 1) }
}

function isTrackedNudge(head: DrillHead, pushed: Aim): boolean {
  return Math.abs(aimTurnOf(head.to, pushed)) <= AIM_TRACK_STEPS
}

/** A settled head points at the nudged aim at once; a turning one turns there instead. */
function nudgedTo(head: DrillHead, pushed: Aim): DrillHead {
  if (isHeadSettled(head)) return newDrillHead(pushed)
  return { ...turnedOn(head), to: pushed }
}
