/**
 * The rig drawn at its collider's width (ticket 913, the GD and TD locks on #666, Q1 (b)): each
 * rig's hull root is scaled across its width only by that rig's own collider factor
 * `bodyHalfSide / 0.45`, on top of the turntable's share (#180), so the drawn body never drifts
 * from the hitbox, during growth and at any Mark. The body's parts, its outline and the slices'
 * pieces scale with it; the drill head scales across its own width by the same factor and rides
 * the grown face, as ticket 789 keeps its tip on the cut's front; the turret and the coal tender
 * keep their size and ride the body's edges from the code-side `body` anchor. Render-only: the
 * width is read from the rig's own presence (or a remote rig's replicated snapshot), never from the
 * physics controller, and nothing here reaches the authority, a save or the protocol.
 */
import { VEHICLE_COLLIDER_SIZE } from '../../constants/physics'
import { BODY_ANCHOR_M } from '../../constants/scene'
import type { DrillHeadPose } from './drillHeadPose'
import { turnedWidthShareOf } from './stagedTurn'

/** The width one rig is drawn at: its own collider's half side, metres. */
export interface RigWidth {
  readonly bodyHalfSide: number
}

/** The bare collider's half side, m: the size the vehicle's art is drawn to. */
const BARE_HALF_SIDE_M = VEHICLE_COLLIDER_SIZE / 2

/** How many times its authored width the rig's body is drawn: 1 bare. */
export function bodyWidthScaleOf(rig: RigWidth): number {
  return rig.bodyHalfSide / BARE_HALF_SIDE_M
}

/** The hull root's `scale.x`: the turntable's signed share times the rig's width scale. */
export function hullRootWidthShareOf(turnRadians: number, rig: RigWidth): number {
  return turnedWidthShareOf(turnRadians) * bodyWidthScaleOf(rig)
}

/** The drawn body's side, m: the side the art is drawn to, times the width scale. */
export function drawnBodyWidthOf(rig: RigWidth): number {
  return VEHICLE_COLLIDER_SIZE * bodyWidthScaleOf(rig)
}

/**
 * Where a part that keeps its size draws its mount point, m across the vehicle's frame: the share
 * of its offset from the `body` anchor that lies on the bare body moves out with the scaled body,
 * and the share past the body's edge (the hitch's overhang) stays, so it never floats off the body.
 */
export function heldMountXOf(mountX: number, rig: RigWidth): number {
  const fromAnchor = mountX - BODY_ANCHOR_M.x
  const onBody = Math.min(BARE_HALF_SIDE_M, Math.max(-BARE_HALF_SIDE_M, fromAnchor))
  return BODY_ANCHOR_M.x + onBody * bodyWidthScaleOf(rig) + (fromAnchor - onBody)
}

/**
 * The `position.x` of a held part's group inside the scaled hull root, whose `scale.x` is
 * `heldMountScaleOf`: its quads keep their authored offsets from the mount point, and the mount
 * point lands on `heldMountXOf`.
 */
export function heldMountShiftOf(mountX: number, rig: RigWidth): number {
  return (heldMountXOf(mountX, rig) - mountX) / bodyWidthScaleOf(rig)
}

/** The `scale.x` that undoes the rig's width scale for a part that keeps its size. */
export function heldMountScaleOf(rig: RigWidth): number {
  return 1 / bodyWidthScaleOf(rig)
}

/**
 * How much further the rig's face lies from its centre along `angle` than the bare body's, m: the
 * grown square's reach (half side times |cos| + |sin|, as `squareReachMmAlong` measures an aim).
 */
export function drawnFaceGrowthOf(angle: number, rig: RigWidth): number {
  const reachPerHalfSide = Math.abs(Math.cos(angle)) + Math.abs(Math.sin(angle))
  return (rig.bodyHalfSide - BARE_HALF_SIDE_M) * reachPerHalfSide
}

/** Moves a drill head drawn for the bare body out to the rig's grown face along its angle. */
export function rideGrownFace(pose: DrillHeadPose, rig: RigWidth): void {
  const growth = drawnFaceGrowthOf(pose.angle, rig)
  pose.x += Math.cos(pose.angle) * growth
  pose.y += Math.sin(pose.angle) * growth
}
