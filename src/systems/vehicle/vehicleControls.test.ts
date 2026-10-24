import { describe, expect, it } from 'vitest'
import { MAX_SPEED_MM_PER_SECOND, SWIVEL_TICKS } from '../../constants/balance'
import { MM_PER_METRE, PHYSICS_TIMESTEP } from '../../constants/physics'
import { engineStats } from '../economy/vehicleStats'
import { AIM, type Aim } from './aim'
import { newDrillHead, settledAimOf, stepDrillHead, type DrillHead } from './drillHead'
import { dot, localUpOf, tangentOf, type Vector2 } from './localFrame'
import { gravityAt, gravityStrengthAt, liftAcceleration } from './radialGravity'
import { buildIntent } from '../input/buildIntent'
import { IDLE_INTENT, type VehicleIntent } from './vehicleIntent'
import { offsetToTileCentre, stepVehicleMotion, type MotionStep } from './vehicleMotion'
import { FACING, facingVectorOf } from './vehiclePose'

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
  maxSpeed?: number,
): MotionStep {
  const up = localUpOf(position, { x: 0, y: 1 })
  let step: MotionStep = {
    velocity: { x: 0, y: 0 },
    isDriving: false,
    isThrusting: false,
    isGravityLimited: false,
  }
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
      isCuttingLevel: false,
      isWaitingForCut: false,
      dt: PHYSICS_TIMESTEP,
      maxSpeed,
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

  it('reads "right" from held actions alone, so no camera angle or mode can change it', () => {
    expect(buildIntent.length).toBe(1)
    expect(buildIntent(['aim_right'])).toEqual({ moveX: 64, aim: AIM.right, lift: false })
  })

  it('gives "right" the same tangential velocity relative to localUp at every planet angle', () => {
    const right = buildIntent(['aim_right'])
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

describe('vehicle analog drive (ticket 791)', () => {
  const alongAfter = (moveX: number) => {
    const intent: VehicleIntent = { moveX, aim: moveX < 0 ? 32 : 0, lift: false }
    return dot(runMotion(PLANET_ANGLES[0], intent, 120).velocity, tangentOf({ x: 0, y: 1 }))
  }

  it('drives a half push at about half the top speed, a full push at the top speed', () => {
    const full = alongAfter(64)
    expect(full).toBeCloseTo(engineStats(0).speedMax, 0)
    expect(alongAfter(32) / full).toBeCloseTo(0.5, 2)
    expect(alongAfter(-16) / full).toBeCloseTo(-0.25, 2)
  })

  it('drives faster the further the push goes', () => {
    const speeds = [8, 16, 24, 32, 40, 48, 56, 64].map(alongAfter)
    speeds.slice(1).forEach((speed, at) => expect(speed).toBeGreaterThan(speeds[at]))
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
      isCuttingLevel: false,
      isWaitingForCut: false,
      dt: PHYSICS_TIMESTEP,
    }).velocity

  it('steers an idle body toward the centre of the bore it drills along', () => {
    const aimDown = buildIntent(['aim_down'])
    expect(motionWith(0.3, aimDown).x).toBeGreaterThan(0)
    expect(motionWith(-0.3, aimDown).x).toBeLessThan(0)
    expect(motionWith(null, aimDown).x).toBe(0)
  })

  it('lets sideways input win over the centring', () => {
    expect(motionWith(-0.3, buildIntent(['aim_down', 'aim_right'])).x).toBeGreaterThan(0)
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

  it('never lets the speed exceed the pose bound, however long the fall or the lift', () => {
    const bound = MAX_SPEED_MM_PER_SECOND / MM_PER_METRE
    expect(speedOf(runMotion(PLANET_ANGLES[2], IDLE_INTENT, 600, 1.4, false).velocity)).toBe(bound)
    const lift = { moveX: 64, aim: null, lift: true } as const
    expect(speedOf(runMotion(PLANET_ANGLES[0], lift, 600, 1, false).velocity)).toBeLessThanOrEqual(
      bound,
    )
  })

  it('holds a long fall to the stats-derived bound it is given (ticket 334)', () => {
    const fall = runMotion(PLANET_ANGLES[2], IDLE_INTENT, 600, 1.4, false, 29.4)
    expect(speedOf(fall.velocity)).toBeCloseTo(29.4, 9)
  })
})

describe('drill head', () => {
  function stepHead(head: DrillHead, pushes: readonly (Aim | null)[]): DrillHead {
    return pushes.reduce(stepDrillHead, head)
  }

  it('takes the latest pushed direction as the facing', () => {
    expect(buildIntent(['aim_down', 'aim_right']).aim).toBe(AIM.right)
    expect(buildIntent(['aim_right', 'aim_down']).aim).toBe(AIM.down)
    expect(buildIntent([]).aim).toBeNull()
  })

  it('reaches the pushed facing within SWIVEL_TICKS steps and keeps it on release', () => {
    const turning = stepHead(newDrillHead(AIM.right), [AIM.down])
    expect(settledAimOf(stepHead(turning, Array(SWIVEL_TICKS - 2).fill(null)))).toBe(AIM.right)
    const turned = stepHead(turning, Array(SWIVEL_TICKS).fill(null))
    expect(settledAimOf(turned)).toBe(AIM.down)
    expect(SWIVEL_TICKS).toBe(8)
  })

  it('tracks a stick nudge of a step or two at once, and turns to anything further (ticket 791)', () => {
    expect(settledAimOf(stepHead(newDrillHead(56), [57]))).toBe(57)
    expect(settledAimOf(stepHead(newDrillHead(56), [58, 60, 62]))).toBe(62)
    expect(settledAimOf(stepHead(newDrillHead(56), [60]))).toBe(56)
  })

  it('follows a sweeping stick a step a tick without ever falling behind', () => {
    const sweep = Array.from({ length: 64 }, (_, step) => step)
    let head = newDrillHead(0)
    for (const aim of sweep) {
      head = stepDrillHead(head, aim)
      expect(settledAimOf(head)).toBe(aim)
    }
  })

  it('lets a nudge during a turn change where it ends, not when', () => {
    const turning = stepHead(newDrillHead(AIM.right), [AIM.down, 49])
    const turned = stepHead(turning, Array(SWIVEL_TICKS - 1).fill(null))
    expect(settledAimOf(turned)).toBe(49)
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
