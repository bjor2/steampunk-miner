import { describe, expect, it } from 'vitest'
import { MAX_STEPS_PER_FRAME, PHYSICS_TIMESTEP } from '../constants/physics'
import { carryPastFrameSteps, countFrameSteps, stepsDroppedByCap } from './fixedStepClock'
import { createTickDilationWatch, watchFrameSteps, type TickDilationWatch } from './tickDilation'

interface Frames {
  clock: { carried: number }
  watch: TickDilationWatch
}

function newFrames(): Frames {
  return { clock: { carried: 0 }, watch: createTickDilationWatch() }
}

/** One frame as the live loop steps it: the capped steps, the drops, then the watch. */
function drawFrame(frames: Frames, frameSeconds: number): void {
  const { clock, watch } = frames
  const steps = countFrameSteps(clock.carried, frameSeconds, PHYSICS_TIMESTEP, MAX_STEPS_PER_FRAME)
  const dropped = stepsDroppedByCap(clock.carried, frameSeconds, PHYSICS_TIMESTEP, steps)
  clock.carried = carryPastFrameSteps(clock.carried, frameSeconds, PHYSICS_TIMESTEP, steps)
  watchFrameSteps(watch, frameSeconds, steps, dropped)
}

/** Frames of `frameSeconds` for about `seconds` of wall time. */
function drawSeconds(frames: Frames, seconds: number, frameSeconds: number): void {
  const count = Math.round(seconds / frameSeconds)
  for (let frame = 0; frame < count; frame++) drawFrame(frames, frameSeconds)
}

/** 0.6 s frames: 36 ticks due, 30 run, 6 dropped (17%). */
const OVERLOADED_FRAME = 0.6

describe('ticks dropped by the frame cap', () => {
  it('counts nothing while every frame runs all its due ticks, at 30 and at 144 frames/s', () => {
    for (const framesPerSecond of [30, 144]) {
      const frames = newFrames()
      drawSeconds(frames, 10, 1 / framesPerSecond)
      expect(frames.watch.ticksDroppedByCap).toBe(0)
    }
  })

  it('counts exactly the ticks a frame past the cap could not run', () => {
    const frames = newFrames()
    drawFrame(frames, 0.5)
    expect(frames.watch.ticksDroppedByCap).toBe(0)
    drawFrame(frames, 0.75)
    expect(frames.watch.ticksDroppedByCap).toBe(45 - MAX_STEPS_PER_FRAME)
    drawFrame(frames, 1 / 60)
    expect(frames.watch.ticksDroppedByCap).toBe(15)
  })
})

describe('slow device chip', () => {
  it('shows after five seconds in a row with more than 5% of the ticks dropped, not after four', () => {
    const frames = newFrames()
    drawSeconds(frames, 4.8, OVERLOADED_FRAME)
    expect(frames.watch.isSlowDevice).toBe(false)
    drawSeconds(frames, 1.2, OVERLOADED_FRAME)
    expect(frames.watch.isSlowDevice).toBe(true)
  })

  it('stays off when the cap drops no more than 5% of the due ticks', () => {
    const frames = newFrames()
    // 31/60 s frames: 31 due, 1 dropped (3.2%).
    drawSeconds(frames, 30, 31 / 60)
    expect(frames.watch.ticksDroppedByCap).toBeGreaterThan(0)
    expect(frames.watch.isSlowDevice).toBe(false)
  })

  it('clears after five steady seconds in a row, not after four', () => {
    const frames = newFrames()
    drawSeconds(frames, 12, OVERLOADED_FRAME)
    drawSeconds(frames, 4, 1 / 60)
    expect(frames.watch.isSlowDevice).toBe(true)
    drawSeconds(frames, 1, 1 / 60)
    expect(frames.watch.isSlowDevice).toBe(false)
  })

  it('starts the five seconds again when a steady second breaks the run', () => {
    const frames = newFrames()
    drawSeconds(frames, 3.6, OVERLOADED_FRAME)
    drawSeconds(frames, 1, 1 / 60)
    drawSeconds(frames, 3.6, OVERLOADED_FRAME)
    expect(frames.watch.isSlowDevice).toBe(false)
  })

  it('never shows for one long hitch, such as a tab back from the background', () => {
    const frames = newFrames()
    drawFrame(frames, 30)
    drawSeconds(frames, 2, 1 / 60)
    expect(frames.watch.ticksDroppedByCap).toBe(30 * 60 - MAX_STEPS_PER_FRAME)
    expect(frames.watch.isSlowDevice).toBe(false)
  })
})
