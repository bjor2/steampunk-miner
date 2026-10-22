/** Authority ticks per second: one tick per fixed physics step (#3). */
export const TICKS_PER_SECOND = 60

/**
 * Fixed physics step. All motion and exposure run on this clock, once per step; render delta is
 * for presentation only (design doc section 17: multiplayer needs a deterministic step).
 */
export const PHYSICS_TIMESTEP = 1 / TICKS_PER_SECOND

/**
 * The most fixed steps one render frame may run, the 0.5 s catch-up `@react-three/rapier` allowed
 * when it stepped the world itself; a longer hitch drops the rest instead of spiralling.
 */
export const MAX_STEPS_PER_FRAME = 30

/**
 * The "slow device" chip (TD on #470, point 5; VS ruling 2): it shows once the cap has dropped
 * more than this share of the due ticks in each of `SLOW_DEVICE_SECONDS` seconds of frames running,
 * and goes once that many seconds in a row stay at or under it.
 */
export const SLOW_DEVICE_DROPPED_SHARE = 1 / 20
export const SLOW_DEVICE_SECONDS = 5

/**
 * `useFrame` order. Negative runs before the scene's default 0 and never takes over rendering
 * (only a positive priority does). The fixed steps run first, then each body draws itself between
 * its last two steps, so the camera, terrain and lights read the position drawn this frame.
 */
export const FIXED_STEP_FRAME_PRIORITY = -2
export const BODY_DRAW_FRAME_PRIORITY = -1

/** The 2D game lives in the XY plane; Z is depth for draw order only. */
export const PLANE_Z = 0

/**
 * `g0` of decision #7: the radial gravity at planet-1 strength, "starting guess 12 m/s²,
 * snappier than 9.81". The planet's gravity multiplier scales it (#2, #4).
 */
export const BASE_GRAVITY = 12

/** Gravity grows linearly from the centre up to this share of the radius (#4: `min(1, r/0.1R)`). */
export const GRAVITY_FULL_FROM_RADIUS_SHARE = 0.1

/**
 * A cut down gains speed no faster than local gravity, and near the core no slower than this share
 * of the planet's surface gravity (Bjor's ruling on #724: "a 0.1 g core floor"), so the core never
 * stalls a dig.
 */
export const DOWN_CUT_GRAVITY_FLOOR_SHARE = 0.1

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

/**
 * The client's floating origin re-centres when the rig is farther than this from it (ticket 339,
 * #316 scope e, locked with both Scalers): f32 Rapier and GPU coordinates then stay within about
 * 1.5 km of zero, where a step is at most 0.12 mm, at any planet radius.
 */
export const RENDER_ORIGIN_REACH_MM = 1_000_000

/**
 * Speed-adaptive substeps (TD scope a on #316, locked with both Scalers, ticket 334): a fixed step
 * whose motion is longer than this is stepped as `n = ceil(step / SUBSTEP_REACH_MM)` world steps
 * of `dt / n` (24 m/s a substep; measured on #316 to stay clean on surface falls and ribs from 0.5
 * to 2.25 m thick up to 384 m/s), the collider halo synced round the body before each.
 */
export const SUBSTEP_REACH_MM = 400

/**
 * The substep budget (the TD's lock on #316 scope a): a step that would need more substeps than
 * this (over 96 m/s) is a kinematic grid sweep instead, with no contact solve, so the physics cost
 * per tick does not grow with speed past it.
 */
export const MAX_PHYSICS_SUBSTEPS = 4

/**
 * The kinematic grid sweep (TD scope a on #316, ticket 334) walks the body's leading face forward
 * this far at a time, one density sample, so no solid sample's contour fits between two probes.
 */
export const KINEMATIC_SWEEP_PROBE_M = 1 / 4

/**
 * The sweep's probes sit this far inside the body's sides, so a body resting on a floor or rubbing
 * a bore's wall slides along it instead of stopping on it.
 */
export const KINEMATIC_SWEEP_INSET_M = 1 / 20

/**
 * The bore strut's plank (ticket 379, Content's strut bore on #310: "a ledge the miner can land
 * on"): two tiles long, centred on the edge between the mouth and the hollow, so it spans a 1 m
 * bore's mouth with half a tile into the rock either side and reaches a tile into the hollow from a
 * level bore. Its top lies on the mouth cell's floor. My pick, by hand in no feel test yet.
 */
export const STRUT_PLANK_LENGTH = 2

/** The plank's thickness, m: more than `GROUND_PROBE_DEPTH`, so a rig resting on it is grounded. */
export const STRUT_PLANK_THICKNESS = 1 / 4
