/**
 * How the vehicle moves this physics step, for the engine chug and the steam hiss, and for the
 * terrain's streaming along the velocity (ticket 336): written by the fixed-step vehicle loop, read
 * by the sound stage and the terrain each frame. A mutable registry, like `drillPresence`, because
 * it changes every step and never goes through React or the store.
 */
export const motionPresence = {
  speedMetresPerSecond: 0,
  /** The velocity in world axes, metres a second. */
  velocity: { x: 0, y: 0 },
  isLifting: false,
}
