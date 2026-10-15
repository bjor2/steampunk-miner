/**
 * The cut-follow (TD scope 0 on #316, ticket 333), the motion rule's part for a rig that actively
 * cuts (the cut gate open, `cutGate.ts`): along its facing the drill law sets the speed (`vCut`),
 * level and down or up alike, with no `speedMax` term. The body reaches that speed, or stops when
 * the drive lets go, within `CUT_FOLLOW_TICKS`, whatever the engine's `accel`: each tick moves the
 * speed along the facing by at least a sixth of the larger of `vCut` and the speed it has.
 *
 * That ramp runs only as a cut starts or stops (K-bound, ticket 400, TD lock on #397 point 3): once
 * a cut has followed the drill for `CUT_FOLLOW_TICKS` ticks it holds `vCut` outright, across cell
 * boundaries and a contact's nudge alike, so the body never stops and ramps back at every cell. A
 * level cut waits for the drill only on a real span stop (`isWaitingForCut`), which ends the hold.
 * What carries it through the gate's shut dwell, and the stop through a lost contact, is
 * `heldCut.ts` (ticket 430).
 */
import { CUT_FOLLOW_TICKS } from '../../constants/balance'
import { FACING, type Facing } from './vehiclePose'

export interface CutFollowMotion {
  /** m/s the drill cuts along the facing (`vCut`). */
  speed: number
  /** The facing in the local frame: along the ground (left, right) or along `localUp` (down, up). */
  facing: Facing
  /** The drive pushes into the facing; with it let go the body stops. */
  isPushing: boolean
  /** Ticks this cut has followed the drill with no stop, up to `CUT_FOLLOW_TICKS` (ticket 400). */
  followedTicks: number
  /** Let go with uncut ground in the body's way: the stop ends there at once (ticket 430). */
  isAtFace?: true
  /**
   * Ticks since the drive let go of this cut (ticket 430): the stop lands on zero by the
   * `CUT_FOLLOW_TICKS`-th from whatever speed contacts leave the body at. Absent while pushed.
   */
  releasedTicks?: number
}

/** Whether the cut-follow drives the speed along the ground, else along `localUp`. */
export function isCutFollowAlongGround(cut: CutFollowMotion): boolean {
  return cut.facing === FACING.left || cut.facing === FACING.right
}

/** The next speed along the cut's axis (signed as the local frame's) from `current`. */
export function cutFollowSpeedOf(
  current: number,
  cut: CutFollowMotion,
  isWaitingForCut: boolean,
): number {
  if (cut.isAtFace === true) return 0
  const target = isFollowingDrill(cut, isWaitingForCut) ? signOfFacing(cut.facing) * cut.speed : 0
  if (target !== 0 && cut.followedTicks >= CUT_FOLLOW_TICKS) return target
  return rampedToward(current, target, rampStepOf(current, cut))
}

/** `followedTicks` for the next tick: one more while the drill sets a speed, else 0. */
export function followedTicksAfter(
  cut: CutFollowMotion | undefined,
  isWaitingForCut: boolean,
): number {
  if (cut === undefined || !isFollowingDrill(cut, isWaitingForCut)) return 0
  return Math.min(CUT_FOLLOW_TICKS, cut.followedTicks + 1)
}

/** The drive pushes into a cut that moves: no span stop, and a `vCut` above 0. */
export function isFollowingDrill(cut: CutFollowMotion, isWaitingForCut: boolean): boolean {
  return cut.isPushing && !isWaitingForCut && cut.speed > 0
}

/**
 * One tick of the start and stop ramp: at least a sixth of `vCut` or the speed it has, and for a
 * let-go cut at least what still lands it on zero in the ticks its stop has left.
 */
function rampStepOf(current: number, cut: CutFollowMotion): number {
  const step = Math.max(cut.speed, Math.abs(current)) / CUT_FOLLOW_TICKS
  if (cut.releasedTicks === undefined) return step
  const ticksLeft = Math.max(1, CUT_FOLLOW_TICKS - cut.releasedTicks)
  return Math.max(step, Math.abs(current) / ticksLeft)
}

function rampedToward(current: number, target: number, maxChange: number): number {
  const gap = target - current
  if (Math.abs(gap) <= maxChange) return target
  return current + Math.sign(gap) * maxChange
}

/** +1 along the tangent or `localUp`, -1 against it. */
function signOfFacing(facing: Facing): number {
  return facing === FACING.right || facing === FACING.up ? 1 : -1
}
