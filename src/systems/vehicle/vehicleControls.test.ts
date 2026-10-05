import { describe, expect, it } from 'vitest'
import { SWIVEL_TICKS } from '../../constants/balance'
import { PHYSICS_TIMESTEP } from '../../constants/physics'
import { engineStats } from '../economy/vehicleStats'
import { newDrillHead, settledFacingOf, stepDrillHead, type DrillHead } from './drillHead'
import { dot, localUpOf, tangentOf, type Vector2 } from './localFrame'
import { gravityAt, gravityStrengthAt, liftAcceleration } from './radialGravity'
import { IDLE_INTENT, intentFromHeldKeys, type VehicleIntent } from './vehicleIntent'
import { offsetToTileCentre, stepVehicleMotion, type MotionStep } from './vehicleMotion'
import { FACING, facingVectorOf, type Facing } from './vehiclePose'

const RADIUS = 300
const PLANET_ANGLES: readonly Vector2[] = [
  { x: 0, y: RADIUS },
  { x: RADIUS, y: 0 },
  { x: 0, y: -RADIUS },
  { x: -RADIUS, y: 0 },
]

/** Runs the motion rule for `steps` fixed steps from rest at a position that does not move. */
function runMotion(
  position: Vector2,
  intent: VehicleIntent,
  steps: number,
  multiplier = 1,
  isGrounded = true,
): MotionStep {
  const up = localUpOf(position, { x: 0, y: 1 })
  let step: MotionStep = { velocity: { x: 0, y: 0 }, isDriving: false, isThrusting: false }
  for (let index = 0; index < steps; index++) {
    step = stepVehicleMotion({
      velocity: step.velocity,
      up,
      gravity: gravityAt(position, RADIUS, multiplier),
      intent,
      engine: engineStats(0),
      canAct: true,
      isGrounded,
      boreOffset: null,
      dt: PHYSICS_TIMESTEP,
    })
  }
  return step
}

const speedOf = (velocity: Vector2) => Math.sqrt(dot(velocity, velocity))

describe('vehicle local frame', () => {
  it('points localUp from the centre through the vehicle at 4 planet angles', () => {
    expect(PLANET_ANGLES.map((position) => localUpOf(position, { x: 0, y: 1 }))).toEqual([
      { x: 0, y: 1 },
      { x: 1, y: 0 },
      { x: 0, y: -1 },
      { x: -1, y: 0 },
    ])
  })

  it('keeps the last localUp below 1 m from the centre', () => {
    const last = { x: 0.6, y: 0.8 }
    expect(localUpOf({ x: 0.5, y: -0.5 }, last)).toBe(last)
  })

  it('reads "right" from held keys alone, so no camera angle or mode can change it', () => {
    expect(intentFromHeldKeys.length).toBe(1)
    expect(intentFromHeldKeys(['KeyD'])).toEqual({ moveX: 1, facing: FACING.right, lift: false })
  })

  it('gives "right" the same tangential velocity relative to localUp at every planet angle', () => {
    const right = intentFromHeldKeys(['KeyD'])
    const local = PLANET_ANGLES.map((position) => {
      const up = localUpOf(position, { x: 0, y: 1 })
      const { velocity } = runMotion(position, right, 30)
      return { along: dot(velocity, tangentOf(up)), upward: dot(velocity, up) }
    })
    local.forEach((frame) => {
      expect(frame.along).toBeCloseTo(local[0].along, 9)
      expect(frame.upward).toBeCloseTo(local[0].upward, 9)
    })
    expect(local[0].along).toBeGreaterThan(0)
  })
})

describe('vehicle bore alignment', () => {
  const motionWith = (boreOffset: number | null, intent: VehicleIntent) =>
    stepVehicleMotion({
      velocity: { x: 0, y: 0 },
      up: { x: 0, y: 1 },
      gravity: { x: 0, y: 0 },
      intent,
      engine: engineStats(0),
      canAct: true,
      isGrounded: true,
      boreOffset,
      dt: PHYSICS_TIMESTEP,
    }).velocity

  it('steers an idle body toward the centre of the bore it drills along', () => {
    const aimDown = intentFromHeldKeys(['KeyS'])
    expect(motionWith(0.3, aimDown).x).toBeGreaterThan(0)
    expect(motionWith(-0.3, aimDown).x).toBeLessThan(0)
    expect(motionWith(null, aimDown).x).toBe(0)
  })

  it('lets sideways input win over the centring', () => {
    expect(motionWith(-0.3, intentFromHeldKeys(['KeyS', 'KeyD'])).x).toBeGreaterThan(0)
  })

  it('measures the offset to the tile centre along the tangent', () => {
    expect(offsetToTileCentre({ x: 20.2, y: 299.5 }, { x: 0, y: 1 })).toBeCloseTo(0.3, 9)
  })
})

describe('vehicle gravity', () => {
  it('follows g0 * multiplier * min(1, r / 0.1R)', () => {
    expect(gravityStrengthAt(RADIUS, RADIUS, 1)).toBe(12)
    expect(gravityStrengthAt(15, RADIUS, 1.25)).toBe(12 * 1.25 * 0.5)
    expect(gravityStrengthAt(30, RADIUS, 1)).toBe(12)
  })

  it('falls 1.25 times as fast on a 1.25 planet as on a 1.0 planet', () => {
    const fallOn = (multiplier: number) =>
      speedOf(runMotion(PLANET_ANGLES[1], IDLE_INTENT, 30, multiplier, false).velocity)
    expect(fallOn(1.25) / fallOn(1)).toBeCloseTo(1.25, 2)
  })

  it('lifts upward at level 0 on every multiplier from 1.15 to 1.4, planet 2 included', () => {
    const lift = { ...IDLE_INTENT, lift: true }
    for (const multiplier of [1.15, 1.25, 1.3, 1.4]) {
      expect(liftAcceleration(engineStats(0).thrustToWeight)).toBeGreaterThan(12 * multiplier)
      const { velocity } = runMotion(PLANET_ANGLES[0], lift, 10, multiplier, false)
      expect(velocity.y).toBeGreaterThan(0)
    }
  })

  it('never lets the speed exceed 16 m/s, however long the fall or the lift', () => {
    expect(speedOf(runMotion(PLANET_ANGLES[2], IDLE_INTENT, 600, 1.4, false).velocity)).toBe(16)
    const lift = { moveX: 1, facing: null, lift: true } as const
    expect(speedOf(runMotion(PLANET_ANGLES[0], lift, 600, 1, false).velocity)).toBeLessThanOrEqual(
      16,
    )
  })
})

describe('drill head', () => {
  function stepHead(head: DrillHead, pushes: readonly (Facing | null)[]): DrillHead {
    return pushes.reduce(stepDrillHead, head)
  }

  it('takes the latest pushed direction as the facing', () => {
    expect(intentFromHeldKeys(['KeyS', 'KeyD']).facing).toBe(FACING.right)
    expect(intentFromHeldKeys(['KeyD', 'KeyS']).facing).toBe(FACING.down)
    expect(intentFromHeldKeys([]).facing).toBeNull()
  })

  it('reaches the pushed facing within SWIVEL_TICKS steps and keeps it on release', () => {
    const turning = stepHead(newDrillHead(FACING.right), [FACING.down])
    expect(settledFacingOf(stepHead(turning, Array(SWIVEL_TICKS - 2).fill(null)))).toBe(
      FACING.right,
    )
    const turned = stepHead(turning, Array(SWIVEL_TICKS).fill(null))
    expect(settledFacingOf(turned)).toBe(FACING.down)
    expect(SWIVEL_TICKS).toBe(8)
  })

  it('builds the world facing from a * tangent + b * localUp with a, b in {-1, 0, 1}', () => {
    const up = { x: 600, y: 800 }
    const tangent = { x: 800, y: -600 }
    expect(facingVectorOf(up.x, up.y, FACING.right)).toEqual(tangent)
    expect(facingVectorOf(up.x, up.y, FACING.left)).toEqual({ x: -tangent.x, y: -tangent.y })
    expect(facingVectorOf(up.x, up.y, FACING.down)).toEqual({ x: -up.x, y: -up.y })
    expect(facingVectorOf(up.x, up.y, FACING.up)).toEqual(up)
  })
})
