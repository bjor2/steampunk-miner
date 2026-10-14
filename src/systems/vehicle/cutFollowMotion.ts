/**
 * The cut-follow (TD scope 0 on #316, ticket 333), the motion rule's part for a rig that actively
 * cuts (the cut gate open, `cutGate.ts`): along its facing the drill law sets the speed (`vCut`),
 * level and down or up alike, with no `speedMax` term. The body reaches that speed, or stops when
 * the drive lets go, within `CUT_FOLLOW_TICKS`, whatever the engine's `accel`: each tick moves the
 * speed along the facing by at least a sixth of the larger of `vCut` and the speed it has. While
 * uncut ground stands in a level cut's way the wheels still wait for the drill.
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
  const target = cut.isPushing && !isWaitingForCut ? signOfFacing(cut.facing) * cut.speed : 0
  const maxChange = Math.max(cut.speed, Math.abs(current)) / CUT_FOLLOW_TICKS
  const gap = target - current
  if (Math.abs(gap) <= maxChange) return target
  return current + Math.sign(gap) * maxChange
}

/** +1 along the tangent or `localUp`, -1 against it. */
function signOfFacing(facing: Facing): number {
  return facing === FACING.right || facing === FACING.up ? 1 : -1
}
