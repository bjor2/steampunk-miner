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
import { useEffect, useMemo } from 'react'
import { FIXED_STEP_FRAME_PRIORITY } from '../constants/physics'
import {
  exposeLiveStepper,
  runFixedStepFrame,
  runLiveSteps,
  type FrameClock,
  type LiveWorld,
} from './liveFixedStep'

/**
 * `isHeld` is read every frame, not taken as a prop, so a hold set by a debug call stops the very
 * next frame: no step, and bodies stay drawn where they were.
 */
export function FixedStepDriver({ isHeld }: { isHeld: () => boolean }) {
  const { step } = useRapier()
  const clock = useMemo<FrameClock>(() => ({ carried: 0 }), [])
  const world = useMemo<LiveWorld>(() => ({ isHeld, stepWorld: step }), [isHeld, step])
  useEffect(() => exposeLiveStepper((ticks) => runLiveSteps(ticks, world)), [world])
  useFrame((_, delta) => runFixedStepFrame(clock, delta, world), FIXED_STEP_FRAME_PRIORITY)
  return null
}
