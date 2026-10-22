/**
 * Radial gravity (decision #7, #4): toward the planet's centre with
 * `g(r) = g0 * gravityMultiplier * min(1, r / (0.1 R))`. The planet multiplier is the only planet
 * knowledge the vehicle controller has (#2, #7).
 *
 * A cut down gains speed at `a = max(g(r), 0.1 * g_surface)` at most (Bjor's ruling on #724): the
 * drill sets the top speed, local gravity how fast the body gets there, and the floor keeps the
 * core from stalling a dig.
 */
import {
  BASE_GRAVITY,
  DOWN_CUT_GRAVITY_FLOOR_SHARE,
  GRAVITY_FULL_FROM_RADIUS_SHARE,
} from '../../constants/physics'
import type { Vector2 } from './localFrame'

export function gravityStrengthAt(radius: number, radiusTiles: number, multiplier: number): number {
  return (
    BASE_GRAVITY * multiplier * Math.min(1, radius / (GRAVITY_FULL_FROM_RADIUS_SHARE * radiusTiles))
  )
}

/** m/s² a cut down may gain speed at, `radius` m from the centre (#724): `max(g(r), 0.1 g_surface)`. */
export function downCutAccelerationAt(
  radius: number,
  radiusTiles: number,
  multiplier: number,
): number {
  const floor = DOWN_CUT_GRAVITY_FLOOR_SHARE * surfaceGravityOf(multiplier)
  return Math.max(gravityStrengthAt(radius, radiusTiles, multiplier), floor)
}

/** The same at a position in metres from the centre. */
export function downCutAccelerationAtPoint(
  position: Vector2,
  radiusTiles: number,
  multiplier: number,
): number {
  const radius = Math.sqrt(position.x * position.x + position.y * position.y)
  return downCutAccelerationAt(radius, radiusTiles, multiplier)
}

/** m/s² at the surface, and anywhere outside the inner tenth of the radius: `g0 * multiplier`. */
export function surfaceGravityOf(multiplier: number): number {
  return BASE_GRAVITY * multiplier
}

/** The gravity acceleration vector at a position, m/s²; zero at the exact centre. */
export function gravityAt(position: Vector2, radiusTiles: number, multiplier: number): Vector2 {
  const radius = Math.sqrt(position.x * position.x + position.y * position.y)
  if (radius === 0) return { x: 0, y: 0 }
  const strength = gravityStrengthAt(radius, radiusTiles, multiplier)
  return { x: (-position.x / radius) * strength, y: (-position.y / radius) * strength }
}

/**
 * The steam-lift's acceleration: `twr` times the vehicle's weight at planet-1 gravity (#7), so
 * the net climb on a planet is `(twr - multiplier) * g0`.
 */
export function liftAcceleration(thrustToWeight: number): number {
  return thrustToWeight * BASE_GRAVITY
}
