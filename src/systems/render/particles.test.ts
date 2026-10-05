import { describe, expect, it } from 'vitest'
import { createSeededRandom } from '../seededRandom'
import {
  createParticlePool,
  particlesDue,
  sprayParticles,
  stepParticles,
  type Spray,
} from './particles'

const SPRAY: Spray = {
  x: 2,
  y: 3,
  dirX: 0,
  dirY: 1,
  speed: 4,
  spreadRadians: 0.5,
  lifeSeconds: 1,
}

function sprayed(count: number, capacity = 64) {
  const pool = createParticlePool(capacity)
  sprayParticles(pool, createSeededRandom(7), SPRAY, count)
  return pool
}

function stepFor(pool: ReturnType<typeof sprayed>, steps: number, stepsPerSecond: number) {
  for (let step = 0; step < steps; step++) stepParticles(pool, 1 / stepsPerSecond)
}

describe('particles', () => {
  it('fly the same straight line at 30 and 144 steps per second', () => {
    const slow = sprayed(1)
    const fast = sprayed(1)
    // A sixth of a second each: 5 steps at 30/s, 24 steps at 144/s.
    stepFor(slow, 5, 30)
    stepFor(fast, 24, 144)
    expect(fast.x[0]).toBeCloseTo(slow.x[0], 4)
    expect(fast.y[0]).toBeCloseTo(slow.y[0], 4)
    expect(slow.y[0]).toBeGreaterThan(SPRAY.y)
  })

  it('leave the pool when their life runs out', () => {
    const pool = sprayed(20)
    stepFor(pool, (SPRAY.lifeSeconds + 0.1) * 60, 60)
    expect(pool.count).toBe(0)
  })

  it('never outgrow the pool', () => {
    expect(sprayed(500, 32).count).toBe(32)
  })

  it('stay inside the spray cone', () => {
    const pool = sprayed(50)
    for (let at = 0; at < pool.count; at++) {
      const speed = Math.hypot(pool.vx[at], pool.vy[at])
      const cosine = (pool.vx[at] * SPRAY.dirX + pool.vy[at] * SPRAY.dirY) / speed
      expect(cosine).toBeGreaterThanOrEqual(Math.cos(SPRAY.spreadRadians) - 1e-6)
    }
  })

  it('emit at the same rate at 30 and 144 frames per second', () => {
    const emitted = (stepsPerSecond: number) => {
      const carry = { owed: 0 }
      let total = 0
      for (let step = 0; step < stepsPerSecond; step++) {
        total += particlesDue(carry, 70, 1 / stepsPerSecond)
      }
      return total
    }
    expect(emitted(30)).toBe(70)
    expect(emitted(144)).toBeGreaterThanOrEqual(69)
    expect(emitted(144)).toBeLessThanOrEqual(70)
  })
})
