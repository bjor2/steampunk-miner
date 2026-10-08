/**
 * The frame the vehicle's Rapier world is measured in (ticket 339, #316 scope e). Rapier is f32, so
 * it measures from a floating render origin near the rig (`systems/render/renderOrigin`), never from
 * the planet's centre; every rule still reads planet metres, the body's translation plus the origin,
 * in doubles. When the rig gets more than the reach (1 km) from the origin, the origin moves to the
 * nearest chunk corner before the step, and the body and the halo's colliders move by the same whole
 * metres the other way: the rig stays where it is on the planet, with its velocity and contacts, so
 * nothing jumps and no wall goes missing. The ONLY writer of the origin the physics measures from.
 */
import type RAPIER from '@dimforge/rapier3d-compat'
import { MM_PER_METRE, RENDER_ORIGIN_REACH_MM } from '../constants/physics'
import {
  isPastOriginReach,
  renderOriginNear,
  type RenderOrigin,
} from '../systems/render/renderOrigin'
import type { Vector2 } from '../systems/vehicle/localFrame'
import type { VehiclePose } from '../systems/vehicle/vehiclePose'
import type { GroundHalo } from './groundHalo'

/** The render origin the body and the halo are measured from; one object, moved in place. */
export interface BodyFrame {
  origin: RenderOrigin
  reachMm: number
}

export function createBodyFrame(origin: RenderOrigin, reachMm?: number): BodyFrame {
  return { origin, reachMm: reachMm ?? RENDER_ORIGIN_REACH_MM }
}

/** Where a pose lies from the chunk corner nearest it, in Rapier's metres, and that corner. */
export function placementNear(pose: VehiclePose): { origin: RenderOrigin; at: Vector2 } {
  const origin = renderOriginNear(pose.x, pose.y)
  return { origin, at: fromOrigin(pose, origin) }
}

export function planetPositionOf(body: RAPIER.RigidBody, origin: RenderOrigin): Vector2 {
  const at = body.translation()
  return { x: at.x + origin.xMm / MM_PER_METRE, y: at.y + origin.yMm / MM_PER_METRE }
}

/**
 * Past the reach the origin moves to the chunk corner nearest the rig, at `position` in planet
 * metres. Moving the body with it is no teleport: it changes only what Rapier measures from, by
 * whole metres, so the body keeps its place on the planet, its velocity and, with the walls moved
 * alike, every contact. The rig's planet position is the same after.
 */
export function recentreWhenFar(
  body: RAPIER.RigidBody,
  halo: GroundHalo,
  frame: BodyFrame,
  position: Vector2,
): void {
  const xMm = position.x * MM_PER_METRE
  const yMm = position.y * MM_PER_METRE
  if (!isPastOriginReach(frame.origin, xMm, yMm, frame.reachMm)) return
  const was = frame.origin
  moveOrigin(halo, frame, renderOriginNear(xMm, yMm))
  shiftBody(body, was, frame.origin)
}

/** A respawn: the body lands on the pose, measured from the chunk corner nearest it. */
export function placeBodyAt(
  body: RAPIER.RigidBody,
  halo: GroundHalo,
  frame: BodyFrame,
  pose: VehiclePose,
): void {
  const placement = placementNear(pose)
  moveOrigin(halo, frame, placement.origin)
  body.setTranslation({ x: placement.at.x, y: placement.at.y, z: 0 }, true)
}

function moveOrigin(halo: GroundHalo, frame: BodyFrame, next: RenderOrigin): void {
  frame.origin = next
  halo.moveOrigin(next)
}

/** Both origins are chunk corners, so the shift is whole metres and f32 adds it exactly. */
function shiftBody(body: RAPIER.RigidBody, was: RenderOrigin, now: RenderOrigin): void {
  const at = body.translation()
  const x = at.x + (was.xMm - now.xMm) / MM_PER_METRE
  const y = at.y + (was.yMm - now.yMm) / MM_PER_METRE
  body.setTranslation({ x, y, z: 0 }, true)
}

function fromOrigin(pose: VehiclePose, origin: RenderOrigin): Vector2 {
  return { x: (pose.x - origin.xMm) / MM_PER_METRE, y: (pose.y - origin.yMm) / MM_PER_METRE }
}
