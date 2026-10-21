/**
 * Where a pop flies (ticket 616, the G&V bars on #442): it spawns at its cell's centre and flies
 * to the hold anchor, both held in the rig's frame, so a pop lands in the hold at 84 m/s instead
 * of trailing behind it. The frame is the rig's drawn centre and local up; `along` runs on the
 * tangent perp(up) = (up.y, -up.x) (`systems/vehicle/localFrame.ts`).
 *
 * A pop is never ahead of the drill's nose: its start is pulled back to the nose's reach along the
 * drill's facing, and the flight is a straight line from there to the anchor behind the nose, so
 * every point of it stays behind (it travels back and up the rig only). No collision with the rig.
 * Writes into the caller's points, so a frame allocates nothing.
 */
import { POP_HOLD_ANCHOR_UP_M } from '../../constants/materialPop'
import { easeInFlight } from './popLook'

export interface PlanePoint {
  x: number
  y: number
}

/** A point in the rig's frame, metres from its drawn centre. */
export interface RigPoint {
  along: number
  upward: number
}

/** The rig as drawn: centre, local up and drill facing (unit vectors), its nose tile's centre. */
export interface RigFrame {
  x: number
  y: number
  up: PlanePoint
  ahead: PlanePoint
  nose: PlanePoint
}

/** The hold anchor in the rig's frame. */
export const HOLD_ANCHOR: RigPoint = { along: 0, upward: POP_HOLD_ANCHOR_UP_M }

/** A tile's centre is half a metre in from its corner. */
const TILE_CENTRE = 0.5

/** The start of a pop from tile `tx, ty`, in the rig's frame, held behind the nose. */
export function popStartOf(tx: number, ty: number, rig: RigFrame, out: RigPoint): RigPoint {
  const fromX = tx + TILE_CENTRE - rig.x
  const fromY = ty + TILE_CENTRE - rig.y
  const past = Math.max(0, forwardOf(rig, fromX, fromY) - noseReachOf(rig))
  return toRigPoint(rig, fromX - rig.ahead.x * past, fromY - rig.ahead.y * past, out)
}

/** The pop `ageSeconds` into a flight of `lifeSeconds`, in the rig's frame. */
export function popRigPointAt(
  start: RigPoint,
  ageSeconds: number,
  lifeSeconds: number,
  out: RigPoint,
): RigPoint {
  const travelled = easeInFlight(ageSeconds / lifeSeconds)
  out.along = start.along + (HOLD_ANCHOR.along - start.along) * travelled
  out.upward = start.upward + (HOLD_ANCHOR.upward - start.upward) * travelled
  return out
}

/** A rig-frame point on the planet, where the rig is drawn now. */
export function planePointOf(rig: RigFrame, point: RigPoint, out: PlanePoint): PlanePoint {
  out.x = rig.x + rig.up.y * point.along + rig.up.x * point.upward
  out.y = rig.y - rig.up.x * point.along + rig.up.y * point.upward
  return out
}

/** How far ahead of the rig's centre, along the drill's facing, a rig-frame point is. */
export function forwardOfRigPoint(rig: RigFrame, point: RigPoint): number {
  const x = rig.up.y * point.along + rig.up.x * point.upward
  const y = -rig.up.x * point.along + rig.up.y * point.upward
  return forwardOf(rig, x, y)
}

/** How far the nose tile's centre reaches ahead of the rig's centre. */
export function noseReachOf(rig: RigFrame): number {
  return forwardOf(rig, rig.nose.x - rig.x, rig.nose.y - rig.y)
}

function forwardOf(rig: RigFrame, x: number, y: number): number {
  return x * rig.ahead.x + y * rig.ahead.y
}

function toRigPoint(rig: RigFrame, x: number, y: number, out: RigPoint): RigPoint {
  out.along = x * rig.up.y - y * rig.up.x
  out.upward = x * rig.up.x + y * rig.up.y
  return out
}
