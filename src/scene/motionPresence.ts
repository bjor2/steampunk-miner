/**
 * How the vehicle moves this physics step, for the engine chug and the steam hiss: written by the
 * fixed-step vehicle loop, read by the sound stage each frame. A mutable registry, like
 * `drillPresence`, because it changes every step and never goes through React or the store.
 */
export const motionPresence = { speedMetresPerSecond: 0, isLifting: false }
