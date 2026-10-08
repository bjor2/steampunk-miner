/**
 * Where the rig and its own axes are drawn this frame, in canvas pixels: its centre, and the
 * screen directions of its right-hand tangent and its up, from the kernel's projection. A drag on
 * the fire tile is read in these axes, so a rolled camera or a leaning rig still aims true.
 */
import { drillPresence } from '../../../scene/drillPresence'
import { vehiclePresence } from '../../../scene/vehiclePresence'
import { project, type Vec2 } from '../../../ui/projection/worldToScreen'
import { rightOfUp, type PlaneVector } from '../systems/render/aimOnScreen'

export interface RigOnScreen {
  centre: PlaneVector
  right: PlaneVector
  up: PlaneVector
}

/** Null while the rig is off screen. */
export function rigOnScreen(): RigOnScreen | null {
  const centre = projectedCopy(vehiclePresence)
  const right = projectedCopy(offsetOf(vehiclePresence, rightOfUp(drillPresence.up)))
  const up = projectedCopy(offsetOf(vehiclePresence, drillPresence.up))
  if (centre === null || right === null || up === null) return null
  return { centre, right: differenceOf(right, centre), up: differenceOf(up, centre) }
}

function offsetOf(point: Vec2, by: PlaneVector): Vec2 {
  return { x: point.x + by.x, y: point.y + by.y }
}

/** `project` hands back one shared point, so each answer is copied before the next call. */
function projectedCopy(world: Vec2): PlaneVector | null {
  const point = project(world)
  return point === null ? null : { x: point.x, y: point.y }
}

function differenceOf(a: PlaneVector, b: PlaneVector): PlaneVector {
  return { x: a.x - b.x, y: a.y - b.y }
}
