/**
 * The slow-speed camera ease (#316, ticket 515, the TD's "Ticket B" shape on #441): below 3 m/s the
 * lean is 0 (`leadShareOf`), so without this the camera is locked to the drawn body and every 5 Hz
 * body lurch shows one to one. The camera instead looks at an eased copy of the body,
 * `eased += (body - eased)(1 - exp(-dt / tau))`, blended in by `w = clamp(3 - vCam, 0, 1)`: full
 * at or under 2 m/s, gone at 3 m/s where the lean starts, so nothing pops. A jump (the first frame,
 * a gap over 2 m, or whatever the scene says to snap on) is never eased across.
 *
 * Presentation only: it runs on the render delta and the client pose, and nothing here reaches
 * the authority, a command, the digest or a replay. The state is updated in place because it runs
 * every frame and must not allocate (CLAUDE.md frame rules).
 */
import { CAMERA_FOLLOW, SPEED_FRAMING } from '../../constants/scene'
import type { Vector2 } from '../vehicle/localFrame'

export interface CameraFollow {
  /** The eased body position, planet metres. */
  x: number
  y: number
  /** False until the first frame has set the eased point on the body. */
  primed: boolean
}

export function createCameraFollow(): CameraFollow {
  return { x: 0, y: 0, primed: false }
}

/** One frame of the ease toward the drawn body; a jump snaps instead. */
export function stepCameraFollow(follow: CameraFollow, body: Vector2, dt: number): void {
  if (isJumpTo(follow, body)) return snapCameraFollow(follow, body)
  const share = 1 - Math.exp(-dt / CAMERA_FOLLOW.easeSeconds)
  follow.x += (body.x - follow.x) * share
  follow.y += (body.y - follow.y) * share
}

/** Puts the eased point on the body: the first frame, a respawn, a showcase, a new planet. */
export function snapCameraFollow(follow: CameraFollow, body: Vector2): void {
  follow.x = body.x
  follow.y = body.y
  follow.primed = true
}

/** `w = clamp(3 - vCam, 0, 1)`: how much of the ease shows at this felt speed. */
export function followWeightOf(feltSpeed: number): number {
  const { leadStartCellsPerSecond } = SPEED_FRAMING
  const span = leadStartCellsPerSecond - CAMERA_FOLLOW.fullEaseCellsPerSecond
  return Math.min(1, Math.max(0, (leadStartCellsPerSecond - feltSpeed) / span))
}

/** The point the camera follows, `body + w (eased - body)`, written into `out`. */
export function followPointInto(
  out: Vector2,
  follow: CameraFollow,
  body: Vector2,
  feltSpeed: number,
): Vector2 {
  const weight = followWeightOf(feltSpeed)
  out.x = body.x + (follow.x - body.x) * weight
  out.y = body.y + (follow.y - body.y) * weight
  return out
}

/** The ease as the debug API reads it (ticket 515 acceptance: max lag under 0.35 m). */
export interface FollowView {
  /** Metres the followed point trails the drawn body; 0 at rest and from 3 m/s. */
  followLagMetres: number
}

/** Metres between the followed point and the body (the debug read, ticket 515). */
export function followLagOf(point: Vector2, body: Vector2): number {
  return Math.hypot(point.x - body.x, point.y - body.y)
}

function isJumpTo(follow: CameraFollow, body: Vector2): boolean {
  if (!follow.primed) return true
  return Math.hypot(body.x - follow.x, body.y - follow.y) > CAMERA_FOLLOW.snapGapMetres
}
