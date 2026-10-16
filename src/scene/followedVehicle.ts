/**
 * The point the camera follows under the lean (ticket 515): the drawn body, eased below 3 m/s by
 * `systems/render/cameraFollow`. It snaps, never eases, across a jump the scene knows of: a dock
 * showcase staging the camera, a render-origin shift, and a placement (a tow, a dock teleport or a
 * planet change, counted by the vehicle loop). The pure rule snaps on the first frame and on a
 * gap over 2 m. Presentation only, written into scratch made once (CLAUDE.md frame rules).
 */
import {
  createCameraFollow,
  followPointInto,
  snapCameraFollow,
  stepCameraFollow,
  type CameraFollow,
} from '../systems/render/cameraFollow'
import type { Vector2 } from '../systems/vehicle/localFrame'
import { motionPresence } from './motionPresence'
import { renderOriginPresence } from './renderOriginPresence'
import { vehicleStagePresence } from './vehicleStage'

export interface FollowedVehicle {
  follow: CameraFollow
  /** The followed point this frame, planet metres. */
  point: Vector2
  /** The jump signals as last seen, to snap on the frame one of them changes. */
  seen: { originX: number; originY: number; placements: number }
}

export function createFollowedVehicle(): FollowedVehicle {
  return {
    follow: createCameraFollow(),
    point: { x: 0, y: 0 },
    seen: { originX: 0, originY: 0, placements: 0 },
  }
}

/** One frame: ease toward the body, or snap on a jump; then blend by the felt speed. */
export function followVehicle(
  followed: FollowedVehicle,
  body: Vector2,
  feltSpeed: number,
  dt: number,
): Vector2 {
  moveFollowToward(followed, body, dt)
  noteJumpSignals(followed.seen)
  return followPointInto(followed.point, followed.follow, body, feltSpeed)
}

function moveFollowToward(followed: FollowedVehicle, body: Vector2, dt: number): void {
  if (hasJumped(followed.seen)) return snapCameraFollow(followed.follow, body)
  stepCameraFollow(followed.follow, body, dt)
}

function hasJumped(seen: FollowedVehicle['seen']): boolean {
  const isShowcased = vehicleStagePresence.cameraWeight > 0
  const hasOriginMoved =
    seen.originX !== renderOriginPresence.x || seen.originY !== renderOriginPresence.y
  return isShowcased || hasOriginMoved || seen.placements !== motionPresence.placements
}

function noteJumpSignals(seen: FollowedVehicle['seen']): void {
  seen.originX = renderOriginPresence.x
  seen.originY = renderOriginPresence.y
  seen.placements = motionPresence.placements
}
