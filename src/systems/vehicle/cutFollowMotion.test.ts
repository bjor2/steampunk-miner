import { describe, expect, it } from 'vitest'
import { CUT_FOLLOW_TICKS } from '../../constants/balance'
import { PHYSICS_TIMESTEP } from '../../constants/physics'
import { engineStats, type EngineStats } from '../economy/vehicleStats'
import { cutFollowSpeedOf, followedTicksAfter, type CutFollowMotion } from './cutFollowMotion'
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
  /** Ticks the cut has already followed the drill as the run starts. */
  followedTicks?: number
  /** Speeds along the cut's axis a contact leaves the body at, by tick, before the step. */
  nudges?: ReadonlyMap<number, number>
}

/** The velocity after each of `ticks` motion steps from `velocity`, cutting as `run` says. */
function speedsAlong(run: Run, ticks: number, velocity: Vector2 = { x: 0, y: 0 }): Vector2[] {
  const isWaitingForCut = run.isWaitingForCut ?? false
  let cutFollow: CutFollowMotion = {
    speed: run.speed,
    facing: run.facing,
    isPushing: run.isPushing ?? true,
    followedTicks: run.followedTicks ?? 0,
  }
  const velocities: Vector2[] = []
  let current = velocity
  for (let tick = 0; tick < ticks; tick++) {
    current = nudged(current, run, tick)
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
      isWaitingForCut,
      dt: PHYSICS_TIMESTEP,
      cutFollow,
    }).velocity
    cutFollow = { ...cutFollow, followedTicks: followedTicksAfter(cutFollow, isWaitingForCut) }
    velocities.push(current)
  }
  return velocities
}

/** The velocity a contact left on `tick`, along the cut's axis; unchanged with none. */
function nudged(velocity: Vector2, run: Run, tick: number): Vector2 {
  const speed = run.nudges?.get(tick)
  if (speed === undefined) return velocity
  return run.facing === FACING.right ? { x: speed, y: 0 } : { x: 0, y: speed }
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

  it('still waits for the drill on a span stop in a level cut', () => {
    const speeds = speedsAlong(
      { intent: RIGHT, facing: FACING.right, speed: 4, isWaitingForCut: true },
      CUT_FOLLOW_TICKS,
      { x: 4, y: 0 },
    )
    expect(along(speeds[CUT_FOLLOW_TICKS - 1])).toBeCloseTo(0, 9)
  })
})

describe('cut-follow hold (ticket 400)', () => {
  it('still ramps from rest as a cut starts', () => {
    const speeds = speedsAlong({ intent: RIGHT, facing: FACING.right, speed: 6 }, 3).map(along)
    expect(speeds[0]).toBeCloseTo(1, 9)
    expect(speeds[1]).toBeCloseTo(2, 9)
    expect(speeds[2]).toBeCloseTo(3, 9)
  })

  it('holds the cut speed outright after a contact slows the body mid-cut', () => {
    const nudges = new Map([[20, 1]])
    const speeds = speedsAlong({ intent: RIGHT, facing: FACING.right, speed: 6, nudges }, 30)
    expect(along(speeds[19])).toBeCloseTo(6, 9)
    expect(along(speeds[20])).toBeCloseTo(6, 9)
  })

  it('takes a slower cell speed at once, never overrunning harder ground', () => {
    const speeds = speedsAlong(
      { intent: RIGHT, facing: FACING.right, speed: 2, followedTicks: CUT_FOLLOW_TICKS },
      1,
      { x: 6, y: 0 },
    )
    expect(along(speeds[0])).toBeCloseTo(2, 9)
  })

  it('holds the cut speed down a shaft too, gravity adding nothing', () => {
    const nudges = new Map([[20, -0.5]])
    const speeds = speedsAlong({ intent: DOWN, facing: FACING.down, speed: 3, nudges }, 21)
    expect(upward(speeds[20])).toBeCloseTo(-3, 9)
  })

  it('ramps down when the drive lets go of a held cut', () => {
    const speeds = speedsAlong(
      {
        intent: IDLE_INTENT,
        facing: FACING.right,
        speed: 6,
        isPushing: false,
        followedTicks: CUT_FOLLOW_TICKS,
      },
      CUT_FOLLOW_TICKS,
      { x: 6, y: 0 },
    ).map(along)
    expect(speeds[0]).toBeCloseTo(5, 9)
    expect(speeds[CUT_FOLLOW_TICKS - 1]).toBeCloseTo(0, 9)
  })

  it('ramps down on a span stop and ramps up again once the cut moves on', () => {
    const held: CutFollowMotion = {
      speed: 6,
      facing: FACING.right,
      isPushing: true,
      followedTicks: CUT_FOLLOW_TICKS,
    }
    expect(followedTicksAfter(held, true)).toBe(0)
    expect(followedTicksAfter({ ...held, speed: 0 }, false)).toBe(0)
    expect(followedTicksAfter(undefined, false)).toBe(0)
    const waiting = speedsAlong(
      { intent: RIGHT, facing: FACING.right, speed: 6, isWaitingForCut: true, followedTicks: 6 },
      1,
      { x: 6, y: 0 },
    )
    expect(along(waiting[0])).toBeCloseTo(5, 9)
  })

  it('counts the ticks a cut follows the drill up to the ramp length', () => {
    const fresh: CutFollowMotion = {
      speed: 6,
      facing: FACING.right,
      isPushing: true,
      followedTicks: 0,
    }
    expect(followedTicksAfter(fresh, false)).toBe(1)
    const held = { ...fresh, followedTicks: CUT_FOLLOW_TICKS }
    expect(followedTicksAfter(held, false)).toBe(CUT_FOLLOW_TICKS)
  })
})

describe('stop at the face (ticket 430 addendum)', () => {
  it("stops a let-go cut at once when uncut ground stands in the body's way", () => {
    const atFace: CutFollowMotion = {
      speed: 15,
      facing: FACING.right,
      isPushing: false,
      followedTicks: 0,
      isAtFace: true,
    }
    expect(cutFollowSpeedOf(12.5, atFace, false)).toBe(0)
    expect(cutFollowSpeedOf(12.5, { ...atFace, isAtFace: undefined }, false)).toBeCloseTo(10, 9)
  })

  it('lands a let-go cut on zero by its sixth tick, whatever speed a contact left it at', () => {
    const letGo: CutFollowMotion = {
      speed: 1.5,
      facing: FACING.right,
      isPushing: false,
      followedTicks: 0,
      releasedTicks: 3,
    }
    expect(cutFollowSpeedOf(1.2, letGo, false)).toBeCloseTo(0.8, 9)
    expect(cutFollowSpeedOf(0.4, { ...letGo, releasedTicks: CUT_FOLLOW_TICKS - 1 }, false)).toBe(0)
    expect(cutFollowSpeedOf(1.5, { ...letGo, releasedTicks: 0 }, false)).toBeCloseTo(1.25, 9)
  })
})

describe('cut down at the planet centre (ticket 539)', () => {
  /**
   * The step along `up`, metres, of a cut held at `speed` m/s along `facing` for a whole ramp,
   * `depthToCentre` m above the centre, clamped to its own speed as the swept cut's bound does.
   */
  const upwardStep = (facing: Facing, speed: number, depthToCentre: number) =>
    upward(
      stepVehicleMotion({
        velocity: { x: 0, y: 0 },
        up: UP,
        gravity: { x: 0, y: 0 },
        intent: facing === FACING.down ? DOWN : { ...DOWN, facing },
        engine: engineStats(0),
        canAct: true,
        isGrounded: false,
        boreOffset: 0,
        isCuttingLevel: false,
        isWaitingForCut: false,
        dt: PHYSICS_TIMESTEP,
        cutFollow: { speed, facing, isPushing: true, followedTicks: CUT_FOLLOW_TICKS },
        maxSpeed: speed,
        depthToCentre,
      }).velocity,
    ) * PHYSICS_TIMESTEP

  it('stops a cut down at the centre when its step would carry the body past it', () => {
    expect(upwardStep(FACING.down, 3600, 1.5)).toBeCloseTo(-1.5, 9)
  })

  it('moves a cut down no further at the centre, nor once past it', () => {
    expect(upwardStep(FACING.down, 3600, 0)).toBe(0)
    expect(upwardStep(FACING.down, 3600, -0.4)).toBe(0)
  })

  it('leaves a cut down short of the centre at the speed the drill sets', () => {
    expect(upwardStep(FACING.down, 3, 295)).toBeCloseTo(-3 * PHYSICS_TIMESTEP, 9)
  })

  it('never holds back a cut up at the centre', () => {
    expect(upwardStep(FACING.up, 3600, 0)).toBeCloseTo(60, 9)
  })
})
