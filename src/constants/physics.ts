/** Authority ticks per second: one tick per fixed physics step (#3). */
export const TICKS_PER_SECOND = 60

/**
 * Fixed physics step. All motion and exposure run on this clock, once per step; render delta is
 * for presentation only (design doc section 17: multiplayer needs a deterministic step).
 */
export const PHYSICS_TIMESTEP = 1 / TICKS_PER_SECOND

/** The 2D game lives in the XY plane; Z is depth for draw order only. */
export const PLANE_Z = 0

/**
 * `g0` of decision #7: the radial gravity at planet-1 strength, "starting guess 12 m/s²,
 * snappier than 9.81". The planet's gravity multiplier scales it (#2, #4).
 */
export const BASE_GRAVITY = 12

/** Gravity grows linearly from the centre up to this share of the radius (#4: `min(1, r/0.1R)`). */
export const GRAVITY_FULL_FROM_RADIUS_SHARE = 0.1

/** Below 1 m from the centre `localUp` keeps its last value (#7). */
export const LOCAL_UP_MIN_RADIUS = 1

/** The body-up vector in a pose report is scaled to this and rounded (#11 pose addition). */
export const UP_VECTOR_SCALE = 1024

/** Millimetres per metre: pose reports carry integer mm and mm/s (#11 amendment). */
export const MM_PER_METRE = 1000

/**
 * A side push reaches the pose report's drive sign only from this share of a full push (Gameplay
 * & Vehicle on #279, accepted by the GD): below it the twin bit drills straight down.
 */
export const DRIVE_PUSH_SHARE_MIN = 0.5

/**
 * Tangential drive acceleration at the engine's 1.0x `accel` (#7 gives only the 1.0x to 1.8x
 * multiplier). A placeholder from the demo scene, tuned by hand in the vehicle feel test.
 */
export const BASE_DRIVE_ACCELERATION = 24

/** The vehicle's collider: at most 0.9 m square, so it fits a 1-tile bore (#7); art may overhang. */
export const VEHICLE_COLLIDER_SIZE = 0.9

/** How far below the body's bottom a solid tile still counts as ground under the wheels, m. */
export const GROUND_PROBE_DEPTH = 0.1

/**
 * While the drill aims down or up with no sideways input, the wheels steer the body onto the
 * centre of its tile column within about this long, so a 0.9 m body drops into the 1 m hole it
 * just bored (#7). A placeholder tuned by hand in the vehicle feel test.
 */
export const BORE_ALIGN_SECONDS = 0.15

/**
 * Collision blocks (decision #36 Collision): the halo is built from 4 x 4 m blocks, each one
 * collider made of its contour segments, rebuilt only when the ground under it changes.
 */
export const COLLISION_BLOCK_METRES = 4

/**
 * Contour walls are extruded this far either side of the XY plane, past the vehicle's own depth,
 * so a box meets them as vertical walls (the game is 2D, Z is locked).
 */
export const WALL_HALF_DEPTH = 1
