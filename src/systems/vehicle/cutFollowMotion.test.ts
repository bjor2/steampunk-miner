import { describe, expect, it } from 'vitest'
import { CUT_FOLLOW_TICKS } from '../../constants/balance'
import { PHYSICS_TIMESTEP } from '../../constants/physics'
import { engineStats, type EngineStats } from '../economy/vehicleStats'
import type { CutFollowMotion } from './cutFollowMotion'
import { dot, tangentOf, type Vector2 } from './localFrame'
import { gravityAt } from './radialGravity'
import { IDLE_INTENT, type VehicleIntent } from './vehicleIntent'
import { stepVehicleMotion } from './vehicleMotion'
import { FACING, type Facing } from './vehiclePose'

// The cut-follow (ticket 333): while the rig actively cuts the drill sets its speed along the
// facing, reached (or stopped) within 6 ticks whatever the engine.

const RADIUS = 300
const POSITION: Vector2 = { x: 0, y: RADIUS - 5 }
const UP: Vector2 = { x: 0, y: 1 }

const RIGHT: VehicleIntent = { moveX: 1, facing: FACING.right, lift: false }
const DOWN: VehicleIntent = { moveX: 0, facing: FACING.down, lift: false }

interface Run {
  intent: VehicleIntent
  facing: Facing
  speed: number
  engine?: EngineStats
  isPushing?: boolean
  isWaitingForCut?: boolean
}

/** The velocity after each of `ticks` motion steps from `velocity`, cutting as `run` says. */
function speedsAlong(run: Run, ticks: number, velocity: Vector2 = { x: 0, y: 0 }): Vector2[] {
  const cutFollow: CutFollowMotion = {
    speed: run.speed,
    facing: run.facing,
    isPushing: run.isPushing ?? true,
  }
  const velocities: Vector2[] = []
  let current = velocity
  for (let tick = 0; tick < ticks; tick++) {
    current = stepVehicleMotion({
      velocity: current,
      up: UP,
      gravity: gravityAt(POSITION, RADIUS, 1),
      intent: run.intent,
      engine: run.engine ?? engineStats(0),
      canAct: true,
      isGrounded: true,
      boreOffset: run.facing === FACING.down ? 0 : null,
      isCuttingLevel: run.facing === FACING.right,
      isWaitingForCut: run.isWaitingForCut ?? false,
      dt: PHYSICS_TIMESTEP,
      cutFollow,
    }).velocity
    velocities.push(current)
  }
  return velocities
}

const along = (velocity: Vector2) => dot(velocity, tangentOf(UP))
const upward = (velocity: Vector2) => dot(velocity, UP)

describe('cut-follow motion (ticket 333)', () => {
  it('reaches the cut speed along a level cut within 6 ticks', () => {
    const speeds = speedsAlong({ intent: RIGHT, facing: FACING.right, speed: 4 }, 20)
    expect(along(speeds[CUT_FOLLOW_TICKS - 1])).toBeCloseTo(4, 9)
    expect(along(speeds[19])).toBeCloseTo(4, 9)
  })

  it('follows the drill past the engine top speed, with no speedMax term', () => {
    const slow = engineStats(0)
    const speeds = speedsAlong({ intent: RIGHT, facing: FACING.right, speed: 15, engine: slow }, 20)
    expect(slow.speedMax).toBeLessThan(15)
    expect(along(speeds[19])).toBeCloseTo(15, 9)
  })

  it('cuts at the same speed whatever the engine', () => {
    const at = (engine: EngineStats) =>
      speedsAlong({ intent: RIGHT, facing: FACING.right, speed: 5, engine }, 30).map(along)
    expect(at(engineStats(400))).toEqual(at(engineStats(0)))
  })

  it('reaches the cut speed down within 6 ticks, and gravity adds nothing to it', () => {
    const speeds = speedsAlong({ intent: DOWN, facing: FACING.down, speed: 3 }, 40)
    expect(upward(speeds[CUT_FOLLOW_TICKS - 1])).toBeCloseTo(-3, 9)
    expect(upward(speeds[39])).toBeCloseTo(-3, 9)
  })

  it('stops within 6 ticks of the drive letting go, level and down', () => {
    const level = speedsAlong(
      { intent: IDLE_INTENT, facing: FACING.right, speed: 9, isPushing: false },
      CUT_FOLLOW_TICKS,
      { x: 9, y: 0 },
    )
    const down = speedsAlong(
      { intent: IDLE_INTENT, facing: FACING.down, speed: 9, isPushing: false },
      CUT_FOLLOW_TICKS,
      { x: 0, y: -9 },
    )
    expect(along(level[CUT_FOLLOW_TICKS - 1])).toBeCloseTo(0, 9)
    expect(upward(down[CUT_FOLLOW_TICKS - 1])).toBe(0)
  })

  it('still waits for the drill while uncut ground stands in a level cut', () => {
    const speeds = speedsAlong(
      { intent: RIGHT, facing: FACING.right, speed: 4, isWaitingForCut: true },
      CUT_FOLLOW_TICKS,
      { x: 4, y: 0 },
    )
    expect(along(speeds[CUT_FOLLOW_TICKS - 1])).toBeCloseTo(0, 9)
  })
})
