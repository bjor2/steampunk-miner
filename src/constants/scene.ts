/**
 * Scene numbers (Build 5, #22). The budgets come from decision #4 ("Rendering and collision
 * cost"); the look numbers are placeholders tuned by eye in `npm run dev` until the #13 look test,
 * each saying so.
 */

/**
 * Orthographic camera zoom in pixels per world metre: #4 sizes the view at about 64 tiles across
 * a 1280-pixel screen, which is what its 16-chunk budget assumes.
 */
export const CAMERA_ZOOM = 20

/** Camera sits in front of the XY plane and looks down -Z. */
export const CAMERA_POSITION: readonly [number, number, number] = [0, 0, 20]

/**
 * The rotating camera closes about 63% of its remaining turn in this long (an exponential ease,
 * so it reads the same at any frame rate). Placeholder, tuned by eye.
 */
export const CAMERA_TURN_SECONDS = 0.3

/** The reference machine's screen (#4): budgets are stated at this size. */
export const REFERENCE_VIEWPORT = { width: 1280, height: 800 } as const

/** At most this many chunk draw calls at the reference screen (#4, #22 acceptance). */
export const MAX_CHUNK_DRAW_CALLS = 16

/** At most this many live tile colliders (#4, #22 acceptance). */
export const MAX_TILE_COLLIDERS = 600

/**
 * Chunk meshes rebuilt per frame, nearest first: one chunk's batch is well under the 2 ms
 * terrain budget of #4, and a full screen refills in 16 frames.
 */
export const CHUNK_BUILDS_PER_FRAME = 1

/** The background fades from sky to the underground dark over this many tiles of depth. */
export const SKY_FADE_DEPTH_TILES = 12

/**
 * Lighting (#13: a dark underground with a warm headlamp cone, the surface lit warmly). Ambient
 * light falls from `AMBIENT_SURFACE` to `AMBIENT_DEEP` over the first tiles below the surface.
 * Placeholders, tuned by eye.
 */
export const AMBIENT_SURFACE = 1
export const AMBIENT_DEEP = 0.1
export const AMBIENT_FADE_DEPTH_TILES = 20
export const HEADLAMP_COLOUR = '#ffd9a0'
export const HEADLAMP_RANGE_TILES = 11
export const HEADLAMP_HALF_ANGLE_RADIANS = 0.55
/** The lamp's soft spill around the vehicle itself, so the body is never in the dark. */
export const HEADLAMP_SPILL_TILES = 2.5

/**
 * Drill sparks (#13 VFX, from a small particle set). Placeholders, tuned by eye; the pool is
 * fixed, so a long drill never allocates.
 */
export const SPARK_CAPACITY = 256
export const SPARKS_PER_SECOND = 70
export const SPARK_LIFE_SECONDS = 0.35
export const SPARK_SPEED = 4
export const SPARK_SPREAD_RADIANS = 1.1
export const SPARK_SIZE_PIXELS = 3
export const SPARK_COLOUR = '#ffb347'
/** Fixed seed for the spark spray: presentation only, never part of the world. */
export const SPARK_SEED = 0x5a7c

/** The travel transition lasts at most 10 s and can be skipped (#8, #10); presentation only. */
export const TRAVEL_TRANSITION_SECONDS = 10

/**
 * How often the HUD and the menus re-read their view models besides store changes (#33): enemy
 * telegraphs and the compass move every tick, and a tenth of a second is quick enough to read
 * while keeping per-tick state out of React. Placeholder, tuned by eye.
 */
export const SCREEN_REFRESH_MS = 100

/**
 * Screen shake and flashes (#13 VFX: intensity-limited, and either can be turned off, #33). The
 * camera moves at most `SHAKE_MAX_METRES` and a flash covers the screen at most
 * `FLASH_MAX_OPACITY`, however many hits stack. Placeholders, tuned by eye.
 */
export const SHAKE_MAX_METRES = 0.22
export const SHAKE_DECAY_SECONDS = 0.18
export const SHAKE_WOBBLE_HZ = 17
export const FLASH_MAX_OPACITY = 0.3
export const FLASH_SECONDS = 0.28
