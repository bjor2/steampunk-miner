/**
 * Radial gravity (decision #7, #4): toward the planet's centre with
 * `g(r) = g0 * gravityMultiplier * min(1, r / (0.1 R))`. The planet multiplier is the only planet
 * knowledge the vehicle controller has (#2, #7).
 */
import { BASE_GRAVITY, GRAVITY_FULL_FROM_RADIUS_SHARE } from '../../constants/physics'
import type { Vector2 } from './localFrame'

export function gravityStrengthAt(radius: number, radiusTiles: number, multiplier: number): number {
  return (
    BASE_GRAVITY * multiplier * Math.min(1, radius / (GRAVITY_FULL_FROM_RADIUS_SHARE * radiusTiles))
  )
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
