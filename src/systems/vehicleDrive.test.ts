import { describe, expect, it } from 'vitest'
import { nextHorizontalVelocity, type DriveTuning } from './vehicleDrive'

const tuning: DriveTuning = { maxSpeed: 6, acceleration: 24 }

function driveFor(
  seconds: number,
  stepsPerSecond: number,
  throttle: number,
  driveTuning: DriveTuning = tuning,
): number {
  const dt = 1 / stepsPerSecond
  let velocity = 0
  for (let i = 0; i < seconds * stepsPerSecond; i++) {
    velocity = nextHorizontalVelocity(velocity, throttle, dt, driveTuning)
  }
  return velocity
}

describe('vehicle drive', () => {
  it('speeds up toward the throttle direction', () => {
    expect(nextHorizontalVelocity(0, 1, 1 / 60, tuning)).toBeCloseTo(0.4)
    expect(nextHorizontalVelocity(0, -1, 1 / 60, tuning)).toBeCloseTo(-0.4)
  })

  it('never exceeds top speed', () => {
    expect(driveFor(5, 60, 1)).toBe(tuning.maxSpeed)
    expect(driveFor(5, 60, 7)).toBe(tuning.maxSpeed)
  })

  it('coasts to a stop with no throttle', () => {
    expect(nextHorizontalVelocity(6, 0, 1, tuning)).toBe(0)
  })

  it('reaches the same speed after the same time at 30 and 144 steps a second', () => {
    const gentle: DriveTuning = { maxSpeed: 6, acceleration: 4 }
    expect(driveFor(0.5, 30, 1, gentle)).toBeCloseTo(driveFor(0.5, 144, 1, gentle), 6)
  })
})
