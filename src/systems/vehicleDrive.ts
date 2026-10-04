/**
 * Horizontal drive of the placeholder vehicle. Time is an argument, so the same inputs give the
 * same velocity at any frame rate.
 */

export interface DriveTuning {
  /** Top speed in m/s. */
  maxSpeed: number
  /** How fast velocity changes toward the target, m/s². */
  acceleration: number
}

/**
 * @param throttle -1 (left) .. 1 (right), 0 coasts to a stop
 * @param dt step length in seconds
 */
export function nextHorizontalVelocity(
  current: number,
  throttle: number,
  dt: number,
  tuning: DriveTuning,
): number {
  const target = clamp(throttle, -1, 1) * tuning.maxSpeed
  return approach(current, target, tuning.acceleration * dt)
}

function approach(current: number, target: number, maxChange: number): number {
  const gap = target - current
  if (Math.abs(gap) <= maxChange) return target
  return current + Math.sign(gap) * maxChange
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}
