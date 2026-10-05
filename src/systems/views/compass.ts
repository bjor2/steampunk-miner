/**
 * The HUD compass (#33 section 5): directions in the vehicle's local frame as an octant 0 to 7
 * (0 local up, then clockwise: 2 local right, 4 local down, 6 local left), so the fixed camera
 * only rotates the drawing, never the model. Integer comparisons only: an offset is diagonal when
 * `5 * min >= 2 * max` of its two local components. Distances are whole tiles.
 */
import { MM_PER_METRE } from '../../constants/physics'
import type { VehiclePose } from '../vehicle/vehiclePose'

export interface MillimetrePoint {
  x: number
  y: number
}

/** The octant of an offset (mm) seen from a pose whose up vector is `upx, upy` (#11 scale). */
export function localOctantOf(pose: VehiclePose, dx: number, dy: number): number {
  const along = dx * pose.upy - dy * pose.upx
  const upward = dx * pose.upx + dy * pose.upy
  if (isDiagonal(Math.abs(along), Math.abs(upward))) return diagonalOctant(along, upward)
  if (Math.abs(upward) >= Math.abs(along)) return upward >= 0 ? 0 : 4
  return along > 0 ? 2 : 6
}

/** Whole tiles between two points in millimetres, rounded down. */
export function tileDistance(from: MillimetrePoint, to: MillimetrePoint): number {
  const dx = to.x - from.x
  const dy = to.y - from.y
  return Math.floor(Math.sqrt(dx * dx + dy * dy) / MM_PER_METRE)
}

/** Tiles from the core's edge: `max(0, floor(r) - coreRadius)`; the core is always local down. */
export function coreEdgeDistance(position: MillimetrePoint, coreRadiusTiles: number): number {
  return Math.max(0, tileDistance({ x: 0, y: 0 }, position) - coreRadiusTiles)
}

function isDiagonal(a: number, b: number): boolean {
  const larger = Math.max(a, b)
  return larger > 0 && 5 * Math.min(a, b) >= 2 * larger
}

function diagonalOctant(along: number, upward: number): number {
  if (upward > 0) return along > 0 ? 1 : 7
  return along > 0 ? 3 : 5
}
