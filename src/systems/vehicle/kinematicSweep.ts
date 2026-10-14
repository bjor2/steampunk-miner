/**
 * The kinematic grid sweep (TD scope a on #316, locked with both Scalers, ticket 334): past the
 * substep budget the body moves with no contact solve. In open space its leading face is walked
 * forward one density sample at a time against the ground, and the step ends at the last probe
 * before solid ground; each probe reads a fixed few points, so the cost is a constant per cell
 * crossed. In the cut the rig follows its swept bore: only the step along the drill's facing is
 * kept, then swept the same way, so it rests against ground the drill has not yet cleared.
 *
 * Pure: metres in, metres out. The physics layer moves the body by the result as a velocity for
 * the tick, never by placing it.
 */
import {
  KINEMATIC_SWEEP_INSET_M,
  KINEMATIC_SWEEP_PROBE_M,
  VEHICLE_COLLIDER_SIZE,
} from '../../constants/physics'
import { dot, type Vector2 } from './localFrame'

/** Whether ground stands at a point, in metres. */
export type IsSolidAt = (x: number, y: number) => boolean

const HALF_BODY_M = VEHICLE_COLLIDER_SIZE / 2
const HALF_FACE_M = HALF_BODY_M - KINEMATIC_SWEEP_INSET_M
/** Probes across the leading face: the two inset corners and three between, a quarter of it apart. */
const FACE_SHARES = [-1, -0.5, 0, 0.5, 1]

/** The part of `step` the body's leading face sweeps from `from` before it meets ground. */
export function sweptStepOf(isSolidAt: IsSolidAt, from: Vector2, step: Vector2): Vector2 {
  const length = Math.sqrt(dot(step, step))
  if (length === 0) return step
  const along = { x: step.x / length, y: step.y / length }
  const probes = Math.ceil(length / KINEMATIC_SWEEP_PROBE_M)
  for (let probe = 1; probe <= probes; probe++) {
    const reach = Math.min(length, probe * KINEMATIC_SWEEP_PROBE_M)
    if (isFaceBlocked(isSolidAt, from, along, reach)) {
      return scaledBy(along, (probe - 1) * KINEMATIC_SWEEP_PROBE_M)
    }
  }
  return step
}

/** The step a rig cutting along `facing` (a unit vector) takes down its bore: the part along it. */
export function boreFollowStepOf(step: Vector2, facing: Vector2): Vector2 {
  return scaledBy(facing, Math.max(0, dot(step, facing)))
}

/** Whether ground stands on the leading face of a body moved `reach` metres along `along`. */
function isFaceBlocked(isSolidAt: IsSolidAt, from: Vector2, along: Vector2, reach: number) {
  const faceX = from.x + along.x * (reach + HALF_BODY_M)
  const faceY = from.y + along.y * (reach + HALF_BODY_M)
  return FACE_SHARES.some((share) =>
    isSolidAt(faceX - along.y * share * HALF_FACE_M, faceY + along.x * share * HALF_FACE_M),
  )
}

function scaledBy(vector: Vector2, length: number): Vector2 {
  return { x: vector.x * length, y: vector.y * length }
}
