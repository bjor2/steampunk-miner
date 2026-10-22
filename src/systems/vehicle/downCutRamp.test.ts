import { describe, expect, it } from 'vitest'
import { CUT_FOLLOW_TICKS } from '../../constants/balance'
import { BASE_GRAVITY, PHYSICS_TIMESTEP } from '../../constants/physics'
import { engineStats } from '../economy/vehicleStats'
import { followedTicksAfter, type CutFollowMotion } from './cutFollowMotion'
import { dot, type Vector2 } from './localFrame'
import { downCutAccelerationAt, gravityAt, gravityStrengthAt } from './radialGravity'
import { stepVehicleMotion, type MotionStepInput } from './vehicleMotion'
import { FACING, type Facing } from './vehiclePose'

// Bjor's ruling on #724: along a cut down the speed rises by at most a*dt a tick, with
// a = max(g(r), 0.1 g_surface); braking stays instant and the top speed stays the drill's.

const RADIUS = 300
const UP: Vector2 = { x: 0, y: 1 }
const PLANET_1 = 1
const PLANET_2 = 5 / 4
const LOW_G = 1 / 2

interface DownRun {
  speeds: readonly number[]
  multiplier: number
  /** Metres from the centre the run starts at, straight above it. */
  startRadius: number
  dt?: number
  facing?: Facing
  /** Without the ramp: the motion rule as it stood before #724. */
  isUnramped?: boolean
  isPushing?: boolean
  startSpeed?: number
  /** Ticks the cut has already followed the drill as the run starts. */
  followedTicks?: number
}

/** The downward speed (m/s, positive down) after each tick, the body moved along as it goes. */
function downSpeedsOf(run: DownRun): number[] {
  const dt = run.dt ?? PHYSICS_TIMESTEP
  const facing = run.facing ?? FACING.down
  const sign = facing === FACING.down ? -1 : 1
  let velocity: Vector2 = { x: 0, y: sign * (run.startSpeed ?? 0) }
  let position: Vector2 = { x: 0, y: run.startRadius }
  let followedTicks = run.followedTicks ?? 0
  const speeds: number[] = []
  for (const speed of run.speeds) {
    const cut: CutFollowMotion = {
      speed,
      facing,
      isPushing: run.isPushing ?? true,
      followedTicks,
    }
    velocity = stepVehicleMotion(stepInput(run, cut, velocity, position, dt)).velocity
    position = { x: position.x + velocity.x * dt, y: position.y + velocity.y * dt }
    followedTicks = followedTicksAfter(cut, false)
    speeds.push(sign * dot(velocity, UP))
  }
  return speeds
}

function stepInput(
  run: DownRun,
  cut: CutFollowMotion,
  velocity: Vector2,
  position: Vector2,
  dt: number,
): MotionStepInput {
  const radius = Math.hypot(position.x, position.y)
  return {
    velocity,
    up: UP,
    gravity: gravityAt(position, RADIUS, run.multiplier),
    intent: { moveX: 0, facing: cut.facing, lift: false },
    engine: engineStats(0),
    canAct: true,
    isGrounded: false,
    boreOffset: 0,
    isCuttingLevel: false,
    isWaitingForCut: false,
    dt,
    cutFollow: cut,
    maxSpeed: 1000,
    ...(run.isUnramped === true
      ? {}
      : { downCutAcceleration: downCutAccelerationAt(radius, RADIUS, run.multiplier) }),
  }
}

const held = (speed: number, ticks: number) => Array.from({ length: ticks }, () => speed)

const meanOf = (values: readonly number[]) =>
  values.reduce((sum, value) => sum + value, 0) / values.length

/** The acceleration the ramp allows at `radius` on a planet of `multiplier`. */
const rampAt = (radius: number, multiplier: number) =>
  downCutAccelerationAt(radius, RADIUS, multiplier)

describe('down-cut gravity ramp: the acceleration (#724)', () => {
  it('is local gravity outside the inner tenth, and never under a tenth of the surface gravity', () => {
    for (const multiplier of [PLANET_1, PLANET_2, LOW_G]) {
      const surface = BASE_GRAVITY * multiplier
      expect(rampAt(RADIUS, multiplier)).toBe(surface)
      expect(rampAt(0.05 * RADIUS, multiplier)).toBe(gravityStrengthAt(15, RADIUS, multiplier))
      expect(rampAt(0.005 * RADIUS, multiplier)).toBeCloseTo(0.1 * surface, 12)
      expect(rampAt(0, multiplier)).toBeCloseTo(0.1 * surface, 12)
    }
  })

  it('scales with the planet: planet 2 pulls 1.25 times planet 1, a low-g planet half', () => {
    expect(rampAt(RADIUS, PLANET_2) / rampAt(RADIUS, PLANET_1)).toBe(1.25)
    expect(rampAt(RADIUS, LOW_G) / rampAt(RADIUS, PLANET_1)).toBe(0.5)
  })
})

describe('down-cut gravity ramp: the motion (#724)', () => {
  it('gains at most a*dt a tick along a cut down, on planet 1, planet 2 and a low-g planet', () => {
    for (const multiplier of [PLANET_1, PLANET_2, LOW_G]) {
      const speeds = downSpeedsOf({ speeds: held(84, 120), multiplier, startRadius: RADIUS - 2 })
      const limit = rampAt(RADIUS, multiplier) * PHYSICS_TIMESTEP
      speeds.forEach((speed, tick) => {
        const before = tick === 0 ? 0 : speeds[tick - 1]
        expect(speed - before).toBeLessThanOrEqual(limit + 1e-12)
      })
      expect(speeds[0]).toBeCloseTo(limit, 12)
    }
  })

  it('reaches the speed of a slow drill no later than the drill alone would', () => {
    const ramped = downSpeedsOf({ speeds: held(0.05, 20), multiplier: 1, startRadius: RADIUS - 2 })
    const unramped = downSpeedsOf({
      speeds: held(0.05, 20),
      multiplier: 1,
      startRadius: RADIUS - 2,
      isUnramped: true,
    })
    expect(ramped).toEqual(unramped)
    expect(ramped[CUT_FOLLOW_TICKS - 1]).toBeCloseTo(0.05, 12)
  })

  it('reaches 95% of the top speed from rest at 0.02 R within the core floor time', () => {
    const top = 4
    const floorAcceleration = 0.1 * BASE_GRAVITY
    const boundTicks = Math.ceil((0.95 * top) / floorAcceleration / PHYSICS_TIMESTEP)
    const speeds = downSpeedsOf({ speeds: held(top, 600), multiplier: 1, startRadius: 6 })
    const reachedAt = speeds.findIndex((speed) => speed >= 0.95 * top)
    expect(reachedAt).toBeGreaterThanOrEqual(0)
    expect(reachedAt + 1).toBeLessThanOrEqual(boundTicks)
  })

  it('never stalls at the centre: the floor keeps the dig gaining speed there', () => {
    const speeds = downSpeedsOf({ speeds: held(4, 10), multiplier: LOW_G, startRadius: 0.5 })
    const floorStep = 0.1 * BASE_GRAVITY * LOW_G * PHYSICS_TIMESTEP
    expect(speeds[9]).toBeGreaterThanOrEqual(10 * floorStep - 1e-12)
  })

  it('takes the same time to 95% at 60 and 144 steps a second', () => {
    const secondsTo95 = (dt: number) => {
      const ticks = Math.ceil(10 / dt)
      const speeds = downSpeedsOf({
        speeds: held(30, ticks),
        multiplier: 1,
        startRadius: RADIUS - 2,
        dt,
      })
      return (speeds.findIndex((speed) => speed >= 0.95 * 30) + 1) * dt
    }
    expect(Math.abs(secondsTo95(1 / 60) - secondsTo95(1 / 144))).toBeLessThanOrEqual(1 / 60)
  })

  it('holds the same top speed as before the ramp, to the bit', () => {
    const ticks = 600
    const ramped = downSpeedsOf({ speeds: held(30, ticks), multiplier: 1, startRadius: RADIUS - 2 })
    const unramped = downSpeedsOf({
      speeds: held(30, ticks),
      multiplier: 1,
      startRadius: RADIUS - 2,
      isUnramped: true,
    })
    expect(Object.is(ramped[ticks - 1], unramped[ticks - 1])).toBe(true)
    expect(ramped[ticks - 1]).toBe(30)
  })

  it('brakes at once to a slower cell, with no ramp on the way down', () => {
    const speeds = downSpeedsOf({
      speeds: [...held(30, 3), 4],
      multiplier: 1,
      startRadius: RADIUS - 2,
      startSpeed: 30,
      followedTicks: CUT_FOLLOW_TICKS,
    })
    expect(speeds[2]).toBe(30)
    expect(speeds[3]).toBe(4)
  })

  it('stops a let-go cut down exactly as the drill stop did before the ramp', () => {
    const run = {
      speeds: held(30, CUT_FOLLOW_TICKS),
      multiplier: 1,
      startRadius: RADIUS - 2,
      startSpeed: 30,
      isPushing: false,
    }
    expect(downSpeedsOf(run)).toEqual(downSpeedsOf({ ...run, isUnramped: true }))
    expect(Math.abs(downSpeedsOf(run)[CUT_FOLLOW_TICKS - 1])).toBe(0)
  })

  it('leaves a cut up to the drill alone', () => {
    const run = { speeds: held(30, 20), multiplier: 1, startRadius: RADIUS - 2, facing: FACING.up }
    expect(downSpeedsOf(run)).toEqual(downSpeedsOf({ ...run, isUnramped: true }))
  })

  // #625: felt speed changes at most 1.5x a cell. The ramp only holds a rise back, never a fall,
  // so from one cell to the next the body's mean speed changes by no more than the drill's does.
  it('never widens the step between two cells the drill law gives', () => {
    const ticksPerCell = 20
    const cells = Array.from({ length: 12 }, (_, cell) => 30 * 1.5 ** (cell / 4))
    const speeds = downSpeedsOf({
      speeds: cells.flatMap((speed) => held(speed, ticksPerCell)),
      multiplier: 1,
      startRadius: RADIUS - 2,
      startSpeed: cells[0],
    })
    const means = cells.map((_, cell) =>
      meanOf(speeds.slice(cell * ticksPerCell, (cell + 1) * ticksPerCell)),
    )
    for (let cell = 1; cell < cells.length; cell++) {
      expect(means[cell] / means[cell - 1]).toBeLessThanOrEqual(cells[cell] / cells[cell - 1])
      expect(means[cell] / means[cell - 1]).toBeLessThanOrEqual(1.5)
    }
  })
})
