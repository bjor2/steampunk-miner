/**
 * The live game's fixed step without React or Rapier: what one render frame steps, and the debug
 * `step(ticks)` (#11 section 5). `FixedStepDriver` calls these with the world's manual `step`
 * and registers its stepper here while it is mounted, the way the world registers itself for
 * `getPhysicsStats()`.
 *
 * A held step (the settings pause, a scenario waiting for play, the debug `pause()`) runs no step
 * and carries no time, however long the frame, so the authority's tick stands still (ticket 301).
 */
import { MAX_STEPS_PER_FRAME, PHYSICS_TIMESTEP } from '../constants/physics'
import { carryPastFrameSteps, countFrameSteps, stepBlendOf } from '../systems/fixedStepClock'
import { stepBlend } from './stepBlend'

export interface FrameClock {
  carried: number
}

/** The world a frame steps: `stepWorld` advances it exactly one fixed step of `dt` seconds. */
export interface LiveWorld {
  isHeld(): boolean
  stepWorld(dt: number): void
}

const mounted: { stepTicks: ((ticks: number) => void) | null } = { stepTicks: null }

/** One render frame: the whole steps it completes, then the share bodies are drawn through. */
export function runFixedStepFrame(clock: FrameClock, frameSeconds: number, world: LiveWorld): void {
  if (world.isHeld()) return
  runDueSteps(clock, frameSeconds, world)
  stepBlend.share = stepBlendOf(clock.carried, PHYSICS_TIMESTEP)
}

/** `ticks` fixed steps now, held or not; bodies are then drawn where the last one left them. */
export function runLiveSteps(ticks: number, world: LiveWorld): void {
  for (let done = 0; done < ticks; done++) world.stepWorld(PHYSICS_TIMESTEP)
  stepBlend.share = 1
}

/** Registers the mounted world's stepper; the returned call unregisters it when the world goes. */
export function exposeLiveStepper(stepTicks: (ticks: number) => void): () => void {
  mounted.stepTicks = stepTicks
  return () => {
    if (mounted.stepTicks === stepTicks) mounted.stepTicks = null
  }
}

/** Why the debug `step(ticks)` cannot run now; the debug API lists it. */
export function liveWorldProblems(): string[] {
  return mounted.stepTicks === null ? ['no physics world is running'] : []
}

/** The debug `step(ticks)` on the running world; nothing without one (`liveWorldProblems`). */
export function stepLiveWorld(ticks: number): void {
  mounted.stepTicks?.(ticks)
}

/** Each manual `step` of exactly one timestep advances the world exactly one fixed step. */
function runDueSteps(clock: FrameClock, frameSeconds: number, world: LiveWorld): void {
  const steps = countFrameSteps(clock.carried, frameSeconds, PHYSICS_TIMESTEP, MAX_STEPS_PER_FRAME)
  clock.carried = carryPastFrameSteps(clock.carried, frameSeconds, PHYSICS_TIMESTEP, steps)
  for (let done = 0; done < steps; done++) world.stepWorld(PHYSICS_TIMESTEP)
}
