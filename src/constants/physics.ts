/** Authority ticks per second: one tick per fixed physics step (#3). */
export const TICKS_PER_SECOND = 60

/**
 * Fixed physics step. All motion and exposure run on this clock, once per step; render delta is
 * for presentation only (design doc section 17: multiplayer needs a deterministic step).
 */
export const PHYSICS_TIMESTEP = 1 / TICKS_PER_SECOND

/** Placeholder gravity (m/s², -Y is down). Real gravity becomes per-planet (design doc section 7). */
export const PLACEHOLDER_GRAVITY_Y = -9.81

/** The 2D game lives in the XY plane; Z is depth for draw order only. */
export const PLANE_Z = 0
