/**
 * One fixed step of the vehicle's motion (decision #7 "Movement on the round world"), as a pure
 * rule the physics motor applies by velocity: wheels drive along the tangent toward the intent's
 * speed, the steam lift pushes along `localUp`, radial gravity pulls, and the speed never exceeds
 * 16 m/s (under 0.3 m per tick, so the tile halo cannot be tunnelled). Rapier then resolves the
 * contacts. The engine stats are the bounded numbers from `computeVehicleStats` (#5 rule 5).
 *
 * A slice's motion effects (ticket 233, `motionEffects.ts`) boost the engine, hold the body against
 * gravity, or set its velocity outright for a burst or a reel. With none, or a vehicle that cannot
 * act, the step is exactly the plain one.
 */
import { MAX_SPEED_MM_PER_SECOND } from '../../constants/balance'
import {
  BASE_DRIVE_ACCELERATION,
  BORE_ALIGN_SECONDS,
  GROUND_PROBE_DEPTH,
  MM_PER_METRE,
  VEHICLE_COLLIDER_SIZE,
} from '../../constants/physics'
import type { EngineStats } from '../economy/vehicleStats'
import { dot, fromLocalFrame, tangentOf, type Vector2 } from './localFrame'
import {
  boostedEngineOf,
  isHeldAgainstGravity,
  steeredVelocityOf,
  type VehicleMotion,
} from './motionEffects'
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
  /**
   * Metres along the tangent to the centre of the bore the drill aims along (down or up), or
   * null when it aims sideways: idle wheels then centre the body so it fits the 1-tile hole.
   */
  boreOffset: number | null
  /**
   * The drill is cutting a level sideways tunnel on the ground (no lift, #36 level cut): contacts
   * never add upward speed, so the body stays on the floor it is cutting instead of riding up the
   * cut's round front.
   */
  isCuttingLevel: boolean
  /** Uncut ground stands at the body's face while it cuts level: the wheels wait for the drill. */
  isWaitingForCut: boolean
  dt: number
  /** The slices' motion effects this step; absent when none applies. */
  effect?: MotionEffectInput
}

export interface MotionEffectInput {
  motion: VehicleMotion
  /** Metres: where a reel pulls from. */
  position: Vector2
  /** Ground touches the body on some side: a clinging vehicle holds there. */
  isTouchingSurface: boolean
}

export interface MotionStep {
  velocity: Vector2
  isDriving: boolean
  isThrusting: boolean
}

const MAX_SPEED = MAX_SPEED_MM_PER_SECOND / MM_PER_METRE

/** What the driven step works with: the engine, the pull, and the upward speed it starts from. */
interface DriveFrame {
  engine: EngineStats
  gravity: Vector2
  upward: number
}

const NO_PULL: Vector2 = Object.freeze({ x: 0, y: 0 })

export function stepVehicleMotion(input: MotionStepInput): MotionStep {
  if (input.effect === undefined || !input.canAct) return drivenStep(input, plainFrameOf(input))
  return effectStep(input, input.effect)
}

/** A burst or reel sets the velocity; otherwise the boosted engine drives, perhaps held. */
function effectStep(input: MotionStepInput, effect: MotionEffectInput): MotionStep {
  const engine = boostedEngineOf(input.engine, effect.motion)
  const steered = steeredVelocityOf(effect.motion, effect.position, engine, input.dt)
  if (steered !== null) return steeredStep(steered)
  return drivenStep(input, effectFrameOf(input, effect, engine))
}

function drivenStep(input: MotionStepInput, frame: DriveFrame): MotionStep {
  const isThrusting = input.canAct && input.intent.lift
  const along = nextAlongSpeed(input, frame.engine)
  const upward =
    frame.upward + (isThrusting ? liftAcceleration(frame.engine.thrustToWeight) : 0) * input.dt
  const local = fromLocalFrame(input.up, along, upward)
  const pulled = {
    x: local.x + frame.gravity.x * input.dt,
    y: local.y + frame.gravity.y * input.dt,
  }
  return {
    velocity: withinSpeedBound(pulled),
    isDriving: input.canAct && input.intent.moveX !== 0 && input.isGrounded,
    isThrusting,
  }
}

/** A burst or reel is the item's own motion: no wheels, no thrust billed. */
function steeredStep(velocity: Vector2): MotionStep {
  return { velocity: withinSpeedBound(velocity), isDriving: false, isThrusting: false }
}

function plainFrameOf(input: MotionStepInput): DriveFrame {
  return { engine: input.engine, gravity: input.gravity, upward: upwardSpeedOf(input) }
}

/** Held against gravity, the body brakes to a stop along `localUp` instead of falling. */
function effectFrameOf(
  input: MotionStepInput,
  effect: MotionEffectInput,
  engine: EngineStats,
): DriveFrame {
  if (!isHeldAgainstGravity(effect.motion, effect.isTouchingSurface)) {
    return { engine, gravity: input.gravity, upward: upwardSpeedOf(input) }
  }
  const brake = BASE_DRIVE_ACCELERATION * engine.accel * input.dt
  return { engine, gravity: NO_PULL, upward: towardZero(upwardSpeedOf(input), brake) }
}

function towardZero(speed: number, maxChange: number): number {
  if (Math.abs(speed) <= maxChange) return 0
  return speed - Math.sign(speed) * maxChange
}

/** The body's speed along `localUp`; a level cut never lets a contact push it upward. */
function upwardSpeedOf(input: MotionStepInput): number {
  const upward = dot(input.velocity, input.up)
  return input.isCuttingLevel ? Math.min(0, upward) : upward
}

/**
 * Wheels steer the tangential speed toward `moveX * speedMax`; with no sideways input they centre
 * the body on the bore it is drilling, or brake.
 */
function nextAlongSpeed(input: MotionStepInput, engine: EngineStats): number {
  const current = dot(input.velocity, tangentOf(input.up))
  const target = input.canAct ? targetAlongSpeed(input, engine) : 0
  const maxChange = BASE_DRIVE_ACCELERATION * engine.accel * input.dt
  const gap = target - current
  if (Math.abs(gap) <= maxChange) return target
  return current + Math.sign(gap) * maxChange
}

function targetAlongSpeed(input: MotionStepInput, engine: EngineStats): number {
  const { intent, boreOffset } = input
  if (input.isWaitingForCut) return 0
  if (intent.moveX !== 0 || boreOffset === null) return intent.moveX * engine.speedMax
  const centring = boreOffset / BORE_ALIGN_SECONDS
  return Math.max(-engine.speedMax, Math.min(engine.speedMax, centring))
}

/** Metres along the tangent from `position` to the centre of the tile it is in. */
export function offsetToTileCentre(position: Vector2, up: Vector2): number {
  const centre = { x: Math.floor(position.x) + 0.5, y: Math.floor(position.y) + 0.5 }
  return dot({ x: centre.x - position.x, y: centre.y - position.y }, tangentOf(up))
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

/** The points just outside the body on its four sides, where a clinging vehicle looks for ground. */
export function surfaceProbesOf(position: Vector2, up: Vector2): Vector2[] {
  const reach = VEHICLE_COLLIDER_SIZE / 2 + GROUND_PROBE_DEPTH
  const side = tangentOf(up)
  return [up, side, { x: -up.x, y: -up.y }, { x: -side.x, y: -side.y }].map((direction) => ({
    x: position.x + direction.x * reach,
    y: position.y + direction.y * reach,
  }))
}
