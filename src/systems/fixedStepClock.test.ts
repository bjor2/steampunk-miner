import { describe, expect, it } from 'vitest'
import { PHYSICS_TIMESTEP } from '../constants/physics'
import type { CommandIntent } from './authority/authorityCommand'
import { createAuthorityState } from './authority/authorityState'
import type { DomainEvent } from './authority/domainEvent'
import { createLoopbackAuthority } from './authority/loopbackAuthority'
import {
  carryPastFrameSteps,
  countFrameSteps,
  NEW_FIXED_STEP_CLOCK,
  stepBlendOf,
  stepsForFrame,
  type FixedStepClock,
} from './fixedStepClock'
import { planetParamsFor } from './world/planetParams'
import { surfaceRowOfColumn } from './world/tileGrid'
import { NO_DRIVE } from './vehicle/driveSigns'

const MAX_STEPS = 8
const WORLD_SEED = 83921
const COLUMN = 20
const SURFACE = surfaceRowOfColumn(COLUMN, planetParamsFor(WORLD_SEED, 1).radiusTiles)

/** The vehicle's pose report standing on row `ty` of the column, with this report's counts. */
function report(ty: number, facing: number, counts: { drillTicks?: number; thrustTicks?: number }) {
  return {
    type: 'reportPose',
    payload: {
      x: COLUMN * 1000 + 500,
      y: ty * 1000 + 500,
      vx: 0,
      vy: counts.thrustTicks ? 4000 : 0,
      upx: 68,
      upy: 1022,
      facing,
      driving: false,
      thrusting: (counts.thrustTicks ?? 0) > 0,
      drilling: (counts.drillTicks ?? 0) > 0,
      thrustTicks: counts.thrustTicks ?? 0,
      driveTicks: 0,
      drillTicks: counts.drillTicks ?? 0,
      drive: NO_DRIVE,
    },
  } as const satisfies CommandIntent
}

/**
 * Dig three tiles straight down from the surface (40 ticks each, reported every 12), then lift
 * back out: the commands a client would send, keyed by the tick they go out on.
 */
function digAndReturnTrip(): Map<number, CommandIntent> {
  const trip = new Map<number, CommandIntent>()
  let tick = 12
  for (let depth = 0; depth < 3; depth++) {
    for (let drilled = 0; drilled < 48; drilled += 12, tick += 12) {
      trip.set(tick, report(SURFACE + 1 - depth, 2, { drillTicks: 12 }))
    }
  }
  for (let ty = SURFACE - 2; ty <= SURFACE + 2; ty++, tick += 12) {
    trip.set(tick, report(ty, 3, { thrustTicks: 12 }))
  }
  return trip
}

/** Frame times of a display at `hz` whose frames start up to `jitterSeconds` late, repeating. */
function jitteredFrames(hz: number, jitterSeconds: number, count: number): number[] {
  const lateness = [0, 0.7, 0.2, 1, 0.4, 0.9, 0.1, 0.6].map((share) => share * jitterSeconds)
  return Array.from(
    { length: count },
    (_, frame) => 1 / hz + lateness[(frame + 1) % 8]! - lateness[frame % 8]!,
  )
}

/**
 * Where a body moving at `speed` m/s is drawn on each frame: the frame loop's step count and
 * carry on plain numbers, the body drawn between its poses before and after the last step.
 */
function drawnPositions(frameTimes: readonly number[], speed: number) {
  let carried = 0
  let steps = 0
  let elapsed = 0
  return frameTimes.map((frameSeconds) => {
    const due = countFrameSteps(carried, frameSeconds, PHYSICS_TIMESTEP, MAX_STEPS)
    carried = carryPastFrameSteps(carried, frameSeconds, PHYSICS_TIMESTEP, due)
    steps += due
    elapsed += frameSeconds
    const before = Math.max(0, steps - 1) * PHYSICS_TIMESTEP * speed
    const after = steps * PHYSICS_TIMESTEP * speed
    const blend = stepBlendOf(carried, PHYSICS_TIMESTEP)
    return { elapsed, steps, blend, drawn: before + (after - before) * blend }
  })
}

/** Plays the trip with render frames of `fps`, stepping the authority once per fixed step. */
function playAtFrameRate(fps: number): { digest: string; events: DomainEvent[] } {
  const authority = createLoopbackAuthority(
    createAuthorityState({ planetIndex: 1, planetSeed: WORLD_SEED, playerIds: ['p1'] }),
  )
  const events: DomainEvent[] = []
  authority.subscribe((answered) => events.push(...answered))
  const trip = digAndReturnTrip()
  const lastTick = Math.max(...trip.keys()) + 600
  let clock: FixedStepClock = NEW_FIXED_STEP_CLOCK
  let tick = 0
  let seq = 0
  while (tick < lastTick) {
    const frame = stepsForFrame(clock, 1 / fps, PHYSICS_TIMESTEP, MAX_STEPS)
    clock = frame.clock
    for (let step = 0; step < frame.steps; step++) {
      authority.advanceTo(++tick)
      const intent = trip.get(tick)
      if (intent !== undefined) authority.submit({ playerId: 'p1', tick, seq: ++seq, ...intent })
    }
  }
  return { digest: authority.snapshot().digest, events }
}

describe('fixed-step clock', () => {
  it('reaches the same step count after the same time at 30 and 144 frames per second', () => {
    const stepsAfter = (fps: number, seconds: number) => {
      let clock: FixedStepClock = NEW_FIXED_STEP_CLOCK
      let total = 0
      for (let frame = 0; frame < fps * seconds; frame++) {
        const next = stepsForFrame(clock, 1 / fps, PHYSICS_TIMESTEP, MAX_STEPS)
        clock = next.clock
        total += next.steps
      }
      return total
    }
    expect(stepsAfter(30, 10)).toBe(600)
    expect(stepsAfter(144, 10)).toBe(600)
  })

  it('drops the steps of a frame longer than the cap instead of running them later', () => {
    expect(stepsForFrame(NEW_FIXED_STEP_CLOCK, 1, PHYSICS_TIMESTEP, MAX_STEPS)).toEqual({
      clock: { carried: 0 },
      steps: MAX_STEPS,
    })
  })

  it('replays a scripted dig-and-return trip to the same digest and events at 30 and 144 fps', () => {
    const at30 = playAtFrameRate(30)
    const at144 = playAtFrameRate(144)
    expect(at144.digest).toBe(at30.digest)
    expect(at144.events).toEqual(at30.events)
    expect(at30.events.filter((event) => event.type === 'TileDestroyed')).toHaveLength(3)
  })

  it('counts the same steps and carry on plain numbers as on the clock', () => {
    let clock: FixedStepClock = NEW_FIXED_STEP_CLOCK
    let carried = 0
    for (const frameSeconds of jitteredFrames(144, 0.002, 500)) {
      const next = stepsForFrame(clock, frameSeconds, PHYSICS_TIMESTEP, MAX_STEPS)
      const steps = countFrameSteps(carried, frameSeconds, PHYSICS_TIMESTEP, MAX_STEPS)
      carried = carryPastFrameSteps(carried, frameSeconds, PHYSICS_TIMESTEP, steps)
      clock = next.clock
      expect(steps).toBe(next.steps)
      expect(carried).toBe(clock.carried)
    }
  })

  it.each([
    [60, 0.0015],
    [59.94, 0.0015],
    [75, 0.001],
    [120, 0.001],
    [144, 0.0005],
  ])(
    'draws a body at constant speed one step behind its true place on every frame at %s Hz',
    (hz, jitterSeconds) => {
      const speed = 6
      const frames = drawnPositions(jitteredFrames(hz, jitterSeconds, Math.round(hz * 3)), speed)
      for (const frame of frames.slice(Math.ceil(hz / 10))) {
        expect(frame.blend).toBeGreaterThanOrEqual(0)
        expect(frame.blend).toBeLessThanOrEqual(1)
        expect(frame.drawn).toBeCloseTo((frame.elapsed - PHYSICS_TIMESTEP) * speed, 6)
      }
    },
  )

  it('blends by the share of a step the frame carries past its last step', () => {
    expect(stepBlendOf(0, PHYSICS_TIMESTEP)).toBe(0)
    expect(stepBlendOf(PHYSICS_TIMESTEP / 2, PHYSICS_TIMESTEP)).toBeCloseTo(0.5, 12)
  })
})
