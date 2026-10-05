/**
 * The run vehicle's part motion (#48): stepped once per physics tick by the vehicle loop from the
 * tick's pose and flags, kicked by a hit cue, read by the parts each frame and by the debug API.
 * A mutable registry, because it changes every tick and never goes through React or the store;
 * this module is its only writer.
 */
import { MM_PER_METRE, PHYSICS_TIMESTEP, UP_VECTOR_SCALE } from '../constants/physics'
import type { ActionFlags } from '../systems/vehicle/poseReport'
import type { VehiclePose } from '../systems/vehicle/vehiclePose'
import {
  createPartMotion,
  recoilFromHit,
  stepPartMotion,
  type PartMotionStep,
} from '../systems/render/partMotion'

export const partMotion = createPartMotion()

const step: PartMotionStep = {
  alongMetresPerSecond: 0,
  upMetresPerSecond: 0,
  isDriving: false,
  isThrusting: false,
  isDrilling: false,
}

/** The tick's velocity in the vehicle's frame: the tangent is perp(up) = (up.y, -up.x). */
export function stepVehicleParts(pose: VehiclePose, flags: ActionFlags): void {
  const upX = pose.upx / UP_VECTOR_SCALE
  const upY = pose.upy / UP_VECTOR_SCALE
  step.alongMetresPerSecond = (pose.vx * upY - pose.vy * upX) / MM_PER_METRE
  step.upMetresPerSecond = (pose.vx * upX + pose.vy * upY) / MM_PER_METRE
  step.isDriving = flags.isDriving
  step.isThrusting = flags.isThrusting
  step.isDrilling = flags.isDrilling
  stepPartMotion(partMotion, step, PHYSICS_TIMESTEP)
}

export function recoilVehicleParts(): void {
  recoilFromHit(partMotion)
}
