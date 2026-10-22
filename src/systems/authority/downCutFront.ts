/**
 * The authority's read of the gravity ramp on a cut down's front (Bjor's ruling on #724,
 * `vehicle/downCutRamp.ts`): the body reported its velocity at its last report, and since then it
 * can have gained at most `a dt` a tick, so the front steps no further in a tick than that allows.
 * It reads the report, never the body's step, so physics jitter between reports cannot shrink the
 * front (TD on #570), and a body that reaches the face already moving is cut for at its speed.
 * Local gravity is read at the step's position. The client reads the same from its replica before
 * it sends the step, so both place the front alike.
 */
import { MM_PER_METRE, UP_VECTOR_SCALE } from '../../constants/physics'
import { rampedFrontStepMmOf } from '../vehicle/downCutRamp'
import { downCutAccelerationAt } from '../vehicle/radialGravity'
import { facingVectorOf, type Facing, type VehiclePose } from '../vehicle/vehiclePose'
import type { PlanetParams } from '../world/planetParams'
import { vehicleOf, type AuthorityState } from './authorityState'

/** A step's position in mm and its facing. */
interface FrontStep {
  x: number
  y: number
  facing: Facing
}

/** The front's step at `step`, `stepMm` held to the gravity ramp on a cut down. */
export function gravityRampedFrontStepMmAt(
  state: AuthorityState,
  playerId: string,
  params: PlanetParams,
  step: FrontStep,
  stepMm: number,
): number {
  const vehicle = vehicleOf(state, playerId)
  if (vehicle.pose === null) return stepMm
  return rampedFrontStepMmOf(step.facing, stepMm, {
    reportedMmPerSecond: reportedAlongFacingOf(vehicle.pose, step.facing),
    ticksSinceReport: Math.max(0, state.tick - vehicle.accountedTick),
    acceleration: accelerationAt(params, step),
  })
}

/** The reported velocity along the facing, mm/s; 0 when it points the other way. */
function reportedAlongFacingOf(pose: VehiclePose, facing: Facing): number {
  const ahead = facingVectorOf(pose.upx, pose.upy, facing)
  return Math.max(0, Math.floor((pose.vx * ahead.x + pose.vy * ahead.y) / UP_VECTOR_SCALE))
}

/** The ramp's acceleration at the step's position, m/s². */
function accelerationAt(params: PlanetParams, step: FrontStep): number {
  const radius = Math.sqrt(step.x * step.x + step.y * step.y) / MM_PER_METRE
  return downCutAccelerationAt(radius, params.radiusTiles, params.gravityMultiplier)
}
