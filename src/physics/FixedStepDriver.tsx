/**
 * Steps the Rapier world on the game's own fixed-step clock (`systems/fixedStepClock`, #3): each
 * render frame runs the whole 1/60 s steps it completes, then publishes how far the frame sits
 * toward the next step (`stepBlend`). `@react-three/rapier` keeps that share private and only
 * applies it to its own `<RigidBody>` meshes, while the game's bodies are plain Rapier bodies, so
 * the world is left paused there and stepped here through its sanctioned manual `step`. The steps
 * per second are unchanged; only where bodies are drawn between steps is new.
 */
import { useFrame } from '@react-three/fiber'
import { useRapier } from '@react-three/rapier'
import { useMemo } from 'react'
import {
  FIXED_STEP_FRAME_PRIORITY,
  MAX_STEPS_PER_FRAME,
  PHYSICS_TIMESTEP,
} from '../constants/physics'
import { carryPastFrameSteps, countFrameSteps, stepBlendOf } from '../systems/fixedStepClock'
import { stepBlend } from './stepBlend'

interface FrameClock {
  carried: number
}

/** `isPaused` stops the clock: no step, and bodies stay drawn where they were. */
export function FixedStepDriver({ isPaused }: { isPaused: boolean }) {
  const { step } = useRapier()
  const clock = useMemo<FrameClock>(() => ({ carried: 0 }), [])
  useFrame((_, delta) => {
    if (isPaused) return
    runDueSteps(clock, delta, step)
    stepBlend.share = stepBlendOf(clock.carried, PHYSICS_TIMESTEP)
  }, FIXED_STEP_FRAME_PRIORITY)
  return null
}

/** Each manual `step` of exactly one timestep advances the world exactly one fixed step. */
function runDueSteps(clock: FrameClock, frameSeconds: number, step: (dt: number) => void): void {
  const steps = countFrameSteps(clock.carried, frameSeconds, PHYSICS_TIMESTEP, MAX_STEPS_PER_FRAME)
  clock.carried = carryPastFrameSteps(clock.carried, frameSeconds, PHYSICS_TIMESTEP, steps)
  for (let done = 0; done < steps; done++) step(PHYSICS_TIMESTEP)
}
