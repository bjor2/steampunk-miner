/**
 * The camera's roll on a round world (#13 "Camera on a round world"): it turns smoothly so local
 * down, toward the core, points down the screen, or stays upright in the fixed-camera mode (the
 * accessibility option). Controls are vehicle-relative (#7), so the mode changes only the view.
 *
 * The ease is exponential in `dt`, so the camera turns the same at any frame rate. The turn is
 * updated in place because it runs every frame and must not allocate (CLAUDE.md frame rules).
 */
import { LOCAL_UP_MIN_RADIUS } from '../../constants/physics'
import { CAMERA_TURN_SECONDS } from '../../constants/scene'
import type { Vector2 } from '../vehicle/localFrame'

export const CAMERA_MODES = ['rotating', 'fixed'] as const

export type CameraMode = (typeof CAMERA_MODES)[number]

export interface CameraTurn {
  /** Roll about the view axis, radians in (-pi, pi]; 0 keeps the planet's north up. */
  angle: number
  /** The last local up; kept below 1 m from the centre, like the vehicle's (#7). */
  up: Vector2
}

export function isCameraMode(value: unknown): value is CameraMode {
  return CAMERA_MODES.includes(value as CameraMode)
}

export function createCameraTurn(): CameraTurn {
  return { angle: 0, up: { x: 0, y: 1 } }
}

/** One frame of the camera: follow local up, then ease toward the mode's target angle. */
export function stepCameraTurn(
  turn: CameraTurn,
  position: Vector2,
  mode: CameraMode,
  dt: number,
): void {
  followLocalUp(turn, position)
  turn.angle = easeAngleToward(turn.angle, targetAngleOf(mode, turn.up), dt)
}

/** The roll that puts `up` at the top of the screen. */
export function angleOfUp(up: Vector2): number {
  return Math.atan2(-up.x, up.y)
}

/** Takes the short way round, and closes the same share of the gap in the same time. */
export function easeAngleToward(current: number, target: number, dt: number): number {
  const share = 1 - Math.exp(-dt / CAMERA_TURN_SECONDS)
  return wrapAngle(current + wrapAngle(target - current) * share)
}

function targetAngleOf(mode: CameraMode, up: Vector2): number {
  return mode === 'fixed' ? 0 : angleOfUp(up)
}

function followLocalUp(turn: CameraTurn, position: Vector2): void {
  const radius = Math.sqrt(position.x * position.x + position.y * position.y)
  if (radius < LOCAL_UP_MIN_RADIUS) return
  turn.up.x = position.x / radius
  turn.up.y = position.y / radius
}

function wrapAngle(angle: number): number {
  return Math.atan2(Math.sin(angle), Math.cos(angle))
}
