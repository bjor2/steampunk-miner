/**
 * One fixed step of the vehicle's motion (decision #7 "Movement on the round world"), as a pure
 * rule the physics motor applies by velocity: wheels drive along the tangent toward the intent's
 * speed, the steam lift pushes along `localUp`, radial gravity pulls, and the speed never exceeds
 * 16 m/s (under 0.3 m per tick, so the tile halo cannot be tunnelled). Rapier then resolves the
 * contacts. The engine stats are the bounded numbers from `computeVehicleStats` (#5 rule 5).
 */
import { MAX_SPEED_MM_PER_SECOND } from '../../constants/balance'
import {
  BASE_DRIVE_ACCELERATION,
  GROUND_PROBE_DEPTH,
  MM_PER_METRE,
  VEHICLE_COLLIDER_SIZE,
} from '../../constants/physics'
import type { EngineStats } from '../economy/vehicleStats'
import { dot, fromLocalFrame, tangentOf, type Vector2 } from './localFrame'
import { liftAcceleration } from './radialGravity'
import type { VehicleIntent } from './vehicleIntent'

export interface MotionStepInput {
  velocity: Vector2
  up: Vector2
  gravity: Vector2
  intent: VehicleIntent
  engine: EngineStats
  /** Active with energy left: a stranded or empty vehicle neither drives nor lifts (#7). */
  canAct: boolean
  isGrounded: boolean
  dt: number
}

export interface MotionStep {
  velocity: Vector2
  isDriving: boolean
  isThrusting: boolean
}

const MAX_SPEED = MAX_SPEED_MM_PER_SECOND / MM_PER_METRE

export function stepVehicleMotion(input: MotionStepInput): MotionStep {
  const isThrusting = input.canAct && input.intent.lift
  const along = nextAlongSpeed(input)
  const upward =
    dot(input.velocity, input.up) +
    (isThrusting ? liftAcceleration(input.engine.thrustToWeight) : 0) * input.dt
  const local = fromLocalFrame(input.up, along, upward)
  const pulled = {
    x: local.x + input.gravity.x * input.dt,
    y: local.y + input.gravity.y * input.dt,
  }
  return {
    velocity: withinSpeedBound(pulled),
    isDriving: input.canAct && input.intent.moveX !== 0 && input.isGrounded,
    isThrusting,
  }
}

/** Wheels steer the tangential speed toward `moveX * speedMax`, or brake it when idle. */
function nextAlongSpeed(input: MotionStepInput): number {
  const current = dot(input.velocity, tangentOf(input.up))
  const target = input.canAct ? input.intent.moveX * input.engine.speedMax : 0
  const maxChange = BASE_DRIVE_ACCELERATION * input.engine.accel * input.dt
  const gap = target - current
  if (Math.abs(gap) <= maxChange) return target
  return current + Math.sign(gap) * maxChange
}

export function withinSpeedBound(velocity: Vector2): Vector2 {
  const speed = Math.sqrt(velocity.x * velocity.x + velocity.y * velocity.y)
  if (speed <= MAX_SPEED) return velocity
  return { x: (velocity.x / speed) * MAX_SPEED, y: (velocity.y / speed) * MAX_SPEED }
}

/** The point just under the wheels, half a body plus the probe depth below the centre. */
export function groundProbeOf(position: Vector2, up: Vector2): Vector2 {
  const reach = VEHICLE_COLLIDER_SIZE / 2 + GROUND_PROBE_DEPTH
  return { x: position.x - up.x * reach, y: position.y - up.y * reach }
}
