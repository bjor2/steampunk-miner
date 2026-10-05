/**
 * The fixed-step clock (#3: the authority tick is the fixed 1/60 s physics step): render frames
 * of any length add up to whole steps, so 30 and 144 frames per second reach the same tick after
 * the same time and a scripted run replays identically at both. Frame time is presentation; only
 * whole steps move the game.
 */
export interface FixedStepClock {
  /** Seconds carried into the next frame, always less than one step. */
  carried: number
}

export const NEW_FIXED_STEP_CLOCK: FixedStepClock = { carried: 0 }

/** How many whole steps this frame completes; a frame longer than `maxSteps` drops the rest. */
export function stepsForFrame(
  clock: FixedStepClock,
  frameSeconds: number,
  stepSeconds: number,
  maxSteps: number,
): { clock: FixedStepClock; steps: number } {
  const available = clock.carried + frameSeconds
  const whole = Math.floor(available / stepSeconds + 1e-9)
  const steps = Math.min(whole, maxSteps)
  const carried = steps < whole ? 0 : Math.max(0, available - steps * stepSeconds)
  return { clock: { carried }, steps }
}
