/**
 * The fixed-step clock (#3: the authority tick is the fixed 1/60 s physics step): render frames
 * of any length add up to whole steps, so 30 and 144 frames per second reach the same tick after
 * the same time and a scripted run replays identically at both. Frame time is presentation; only
 * whole steps move the game. What a frame carries past its last step says how far the frame sits
 * toward the next step, so a body drawn between its last two steps moves on every frame, not
 * only on the frames that happen to complete a step.
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
  const steps = countFrameSteps(clock.carried, frameSeconds, stepSeconds, maxSteps)
  const carried = carryPastFrameSteps(clock.carried, frameSeconds, stepSeconds, steps)
  return { clock: { carried }, steps }
}

/**
 * The whole steps a frame completes from `carried` seconds, at most `maxSteps`. With
 * `carryPastFrameSteps` it is `stepsForFrame` on plain numbers, for a frame loop that must not
 * allocate.
 */
export function countFrameSteps(
  carried: number,
  frameSeconds: number,
  stepSeconds: number,
  maxSteps: number,
): number {
  return Math.min(wholeStepsIn(carried + frameSeconds, stepSeconds), maxSteps)
}

/** The seconds left after the frame's `steps`; a frame cut short by the cap carries nothing. */
export function carryPastFrameSteps(
  carried: number,
  frameSeconds: number,
  stepSeconds: number,
  steps: number,
): number {
  const available = carried + frameSeconds
  if (steps < wholeStepsIn(available, stepSeconds)) return 0
  return Math.max(0, available - steps * stepSeconds)
}

/**
 * How far a frame that carries `carried` seconds sits from the last step (0) toward the next (1):
 * the share by which a body is drawn from its pose before the last step toward its pose after it.
 */
export function stepBlendOf(carried: number, stepSeconds: number): number {
  return Math.min(1, carried / stepSeconds)
}

function wholeStepsIn(seconds: number, stepSeconds: number): number {
  return Math.floor(seconds / stepSeconds + 1e-9)
}
