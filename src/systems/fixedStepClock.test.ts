import { describe, expect, it } from 'vitest'
import { PHYSICS_TIMESTEP } from '../constants/physics'
import type { CommandIntent } from './authority/authorityCommand'
import { createAuthorityState } from './authority/authorityState'
import type { DomainEvent } from './authority/domainEvent'
import { createLoopbackAuthority } from './authority/loopbackAuthority'
import { NEW_FIXED_STEP_CLOCK, stepsForFrame, type FixedStepClock } from './fixedStepClock'
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
})
