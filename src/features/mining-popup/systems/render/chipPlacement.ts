/**
 * Where chips and the plaque go (#172 §1 and §2 placement, from the Gameplay & Vehicle feel check):
 * away from where the vehicle is going. Faster than its drive speed (lifting, falling, grappling)
 * a chip spawns opposite the velocity, otherwise opposite the drill; directions are in the
 * vehicle's local frame (`along` the tangent, `upward` along local up), never the screen's, since
 * the planet is round. While lifting at speed the plaque leaves the top band for the bottom one.
 *
 * Presentation maths, read from the last pose the client reported (mm, mm/s, up scaled by 1024).
 */
import { MM_PER_METRE, UP_VECTOR_SCALE } from '../../../../constants/physics'
import { FACING, type Facing, type VehiclePose } from '../../../../systems/vehicle/vehiclePose'
import type { Vector2 } from '../../../../systems/vehicle/localFrame'

/** A unit direction in the vehicle's local frame. */
export interface LocalDirection {
  along: number
  upward: number
}

/** The vehicle's velocity in its local frame, m/s, and how fast it drives. */
export interface VehicleMotion {
  alongSpeed: number
  upwardSpeed: number
  driveSpeed: number
  facing: Facing
}

export type PlaqueBand = 'top' | 'bottom'

/** Half the 0.9 m collider (`VEHICLE_COLLIDER_SIZE`): where the hull ends. */
const HULL_HALF_TILES = 0.45
/** §1: chips sit at least 1.5 tiles from the hull. */
const CHIP_GAP_TILES = 1.5
/** Half a chip's height at the default 12 m zoom, so its near edge keeps the gap. */
const CHIP_HALF_TILES = 0.4

const AT_REST: VehicleMotion = { alongSpeed: 0, upwardSpeed: 0, driveSpeed: 0, facing: FACING.down }

/** The reported pose's motion; at rest, drill down, before any report. */
export function motionOfPose(pose: VehiclePose | null, driveSpeed: number): VehicleMotion {
  if (pose === null) return AT_REST
  const upX = pose.upx / UP_VECTOR_SCALE
  const upY = pose.upy / UP_VECTOR_SCALE
  // The tangent is perp(up) = (up.y, -up.x) (systems/vehicle/localFrame.ts).
  const alongSpeed = (pose.vx * upY - pose.vy * upX) / MM_PER_METRE
  const upwardSpeed = (pose.vx * upX + pose.vy * upY) / MM_PER_METRE
  return { alongSpeed, upwardSpeed, driveSpeed, facing: pose.facing }
}

export function isTravellingFast(motion: VehicleMotion): boolean {
  const speedSquared =
    motion.alongSpeed * motion.alongSpeed + motion.upwardSpeed * motion.upwardSpeed
  return speedSquared > motion.driveSpeed * motion.driveSpeed
}

/** Where a new chip spawns: opposite the velocity when fast, else opposite the drill. */
export function awayDirectionOf(motion: VehicleMotion): LocalDirection {
  return isTravellingFast(motion) ? oppositeVelocityOf(motion) : oppositeFacingOf(motion.facing)
}

/** The bottom band only while lifting faster than the drive speed, so the shaft ahead stays clear. */
export function plaqueBandOf(motion: VehicleMotion): PlaqueBand {
  return isTravellingFast(motion) && motion.upwardSpeed > 0 ? 'bottom' : 'top'
}

/** How far a chip's centre sits from the vehicle's, metres. */
export const CHIP_REACH_TILES = HULL_HALF_TILES + CHIP_GAP_TILES + CHIP_HALF_TILES

/** A chip's offset from the vehicle's centre in its local frame, metres. */
export function chipOffsetOf(away: LocalDirection): LocalDirection {
  return { along: away.along * CHIP_REACH_TILES, upward: away.upward * CHIP_REACH_TILES }
}

/**
 * How many chip heights a chip sits from the first, on screen: later slots stack away from the
 * vehicle, upward for a chip above it and downward for one below, so three never overlap at any
 * zoom (a stack in metres grows past the plaque's band when zoomed in).
 */
export function chipStackOf(away: LocalDirection, slot: number): number {
  return away.upward < 0 ? slot : -slot
}

/** Writes `centre + offset` (offset in the frame whose up is `up`) into `out`; no allocation. */
export function placeInLocalFrame(
  centre: Readonly<Vector2>,
  up: Readonly<Vector2>,
  offset: LocalDirection,
  out: Vector2,
): void {
  out.x = centre.x + offset.along * up.y + offset.upward * up.x
  out.y = centre.y - offset.along * up.x + offset.upward * up.y
}

function oppositeVelocityOf({ alongSpeed, upwardSpeed }: VehicleMotion): LocalDirection {
  const speed = Math.sqrt(alongSpeed * alongSpeed + upwardSpeed * upwardSpeed)
  return { along: -alongSpeed / speed, upward: -upwardSpeed / speed }
}

function oppositeFacingOf(facing: Facing): LocalDirection {
  if (facing === FACING.left) return { along: 1, upward: 0 }
  if (facing === FACING.right) return { along: -1, upward: 0 }
  if (facing === FACING.up) return { along: 0, upward: -1 }
  return { along: 0, upward: 1 }
}
