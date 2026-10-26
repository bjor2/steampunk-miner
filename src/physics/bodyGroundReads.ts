/**
 * What the vehicle's motor reads of the ground round its body (split from `vehicleController.ts`):
 * whether its wheels stand on something, whether a clinging rig touches a surface, and where its
 * collider may grow (ticket 750). Each reads the collider's own half side, which grows with the
 * width level. Density reads only, no Rapier: a strut's plank is asked of its collider set.
 */
import { BASE_GRAVITY, PHYSICS_TIMESTEP } from '../constants/physics'
import type { IsBlockedAt } from '../systems/vehicle/bodyGrowth'
import type { Vector2 } from '../systems/vehicle/localFrame'
import { isPlainMotion, type VehicleMotion } from '../systems/vehicle/motionEffects'
import { surfaceProbesOf, type MotionEffectInput } from '../systems/vehicle/vehicleMotion'
import type { GroundReader } from '../systems/world/groundReader'
import { ISO_DENSITY } from '../systems/world/sampleGrid'
import type { StrutColliders } from './strutColliders'

/** The collider's centre and up, m, and its half side. */
export interface BodyAt {
  position: Vector2
  up: Vector2
  halfSide: number
}

/** Ground under the wheels: solid ground, or a strut's plank (ticket 379). */
export function isGroundedAt(
  ground: GroundReader,
  struts: StrutColliders,
  probe: Vector2,
): boolean {
  return isSolidAt(ground, probe) || struts.isOnPlank(probe)
}

/** The effect for the motion rule, or nothing for no effect; ground is probed only to cling. */
export function motionEffectInputOf(
  motion: VehicleMotion | undefined,
  body: BodyAt,
  ground: GroundReader,
): MotionEffectInput | undefined {
  if (motion === undefined || isPlainMotion(motion)) return undefined
  const isTouchingSurface = motion.isClinging && isTouchingAnySide(ground, body)
  return { motion, position: body.position, isTouchingSurface }
}

function isTouchingAnySide(ground: GroundReader, { position, up, halfSide }: BodyAt): boolean {
  return surfaceProbesOf(position, up, halfSide).some((probe) => isSolidAt(ground, probe))
}

function isSolidAt(ground: GroundReader, point: Vector2): boolean {
  return ground.densityAtPoint(point.x, point.y) >= ISO_DENSITY
}

/** What the collider may not grow into (ticket 750), read on the step's ground: set `ground`. */
export interface BlockedReader {
  ground: GroundReader | null
  isBlockedAt: IsBlockedAt
}

/** Solid ground or a strut's plank; one reader and one probe point for the controller's life. */
export function createBlockedReader(struts: StrutColliders): BlockedReader {
  const probe = { x: 0, y: 0 }
  const reader: BlockedReader = {
    ground: null,
    isBlockedAt: (x, y) => {
      probe.x = x
      probe.y = y
      const isSolid = reader.ground !== null && isSolidAt(reader.ground, probe)
      return isSolid || struts.isOnPlank(probe)
    },
  }
  return reader
}

/**
 * A body falling slower than this along its up, m/s, rests on what is under it: two steps of
 * planet-1 gravity, which a body on its floor never builds up between contacts.
 */
const RESTING_FALL_MPS = 2 * BASE_GRAVITY * PHYSICS_TIMESTEP

/** What says whether the wheels stand on a floor: the ground probe, the body's motion, its cut. */
export interface FloorHold {
  isGrounded: boolean
  velocity: Vector2
  up: Vector2
  /** The gate is open on a cut down or up: the face under the wheels is the one the cut opens. */
  isCuttingAlongUp: boolean
}

/**
 * Whether a floor holds the wheels (ticket 750, the growth's held fall): ground under the probe or
 * a body at rest, as one on a slope rests on its high corner with air under its middle; never a
 * cut down or up, whose face falls away under it, nor a body already falling.
 */
export function isHeldByFloor({ isGrounded, velocity, up, isCuttingAlongUp }: FloorHold): boolean {
  if (isCuttingAlongUp) return false
  const fall = -(velocity.x * up.x + velocity.y * up.y)
  return isGrounded || fall < RESTING_FALL_MPS
}
