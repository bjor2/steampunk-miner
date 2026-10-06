/**
 * How far the frame being drawn sits from the last fixed step (0) toward the next (1): written by
 * `FixedStepDriver` each frame right after it steps the world, read by each body that draws itself
 * between its pose before and after the last step, so motion shows on every frame instead of
 * only on frames that complete a step. A mutable registry, because it changes every frame and
 * never goes through React or the store.
 */
export const stepBlend = { share: 1 }
