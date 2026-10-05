/**
 * The three-zone contact rule of decision #9, on the integers of the #11 pose addition:
 *
 *   front : dot > 0 and 2*dot^2 >= |d|^2 * |f|^2     (within 45 degrees of the drill axis)
 *   rear  : dot < 0 and 2*dot^2 >= |d|^2 * |f|^2
 *   side  : everything else
 *
 * `f` is the facing vector built from the reported `upx, upy` and `facing` (scaled to 1024, its
 * length squared computed exactly), `d` the vehicle-to-enemy offset in mm. Exactly 45 degrees is
 * front (or rear). The test runs in the vehicle's own frame, so the planet angle never matters.
 *
 * Valid for |d| <= 65535 mm. `2*dot^2` can pass 2^53 there, so it is compared as
 * `dot^2 >= |d|^2*|f|^2 - dot^2`, where every term stays below 2^53.
 */
import type { HitArc } from '../../economy/economyDefinition'
import { facingVectorOf, type Facing } from '../../vehicle/vehiclePose'

export type { HitArc }

export interface DrillFrame {
  upx: number
  upy: number
  facing: Facing
}

export function hitArcOf(frame: DrillFrame, dx: number, dy: number): HitArc {
  const axis = facingVectorOf(frame.upx, frame.upy, frame.facing)
  const dot = axis.x * dx + axis.y * dy
  if (dot === 0 || !isWithinHalfRightAngle(dot, dx * dx + dy * dy, lengthSq(axis))) return 'side'
  return dot > 0 ? 'front' : 'rear'
}

function isWithinHalfRightAngle(
  dot: number,
  offsetLengthSq: number,
  axisLengthSq: number,
): boolean {
  const dotSq = dot * dot
  return dotSq >= offsetLengthSq * axisLengthSq - dotSq
}

function lengthSq(vector: { x: number; y: number }): number {
  return vector.x * vector.x + vector.y * vector.y
}
