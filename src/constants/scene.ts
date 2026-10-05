/**
 * Scene numbers (Build 5, #22). The budgets come from decision #4 ("Rendering and collision
 * cost"); the look numbers are placeholders tuned by eye in `npm run dev` until the #13 look test,
 * each saying so.
 */

/**
 * Zoom framing (#39): the view is sized by the world metres across the screen's shorter axis, not
 * by pixels per metre, so 1080p and 4K show the same world. 12 m puts the 0.9 m vehicle collider
 * at 7.5% of the short axis (13.3 body heights); the player zooms between 8 m and 20 m, a factor
 * of 1.25 per step, eased over 0.2 s. Presentation only: never in the authority or the digest.
 */
export const VIEW_SHORT_AXIS_DEFAULT_M = 12
export const VIEW_SHORT_AXIS_MIN_M = 8
export const VIEW_SHORT_AXIS_MAX_M = 20
export const ZOOM_STEP_FACTOR = 1.25
export const ZOOM_EASE_SECONDS = 0.2

/**
 * At most this many 32 m chunks drawn at the 20 m zoom-out, at any resolution (#38 visible-block
 * budget: 7 touched plus a one-ring margin).
 */
export const MAX_DRAWN_CHUNKS_AT_MAX_ZOOM = 9

/**
 * Ground render blocks (#38 visible-block budget): the ground is culled by the view circle in
 * 8 m blocks, so at the 20 m zoom-out at most 48 are drawn (37 touched in the worst case plus a
 * one-ring margin), the same count at 1080p and 4K.
 */
export const GROUND_BLOCK_SIZE = 8
export const MAX_DRAWN_GROUND_BLOCKS = 48

/**
 * The frame's draw-call ceiling (#38 frame budget, from the R3F "a few hundred or less" advice):
 * ground 1-2 per chunk batch, vehicle at most 30, enemies, particles, platform and post-processing.
 */
export const MAX_DRAW_CALLS = 150

/**
 * Adaptive render scale (#38 "4K strategy"): the canvas renders at `scale x devicePixelRatio` and
 * is upscaled; the HTML UI stays native. 1.0 is a native render; the floor is a 1920 x 1080
 * internal render (0.5 at 4K). It starts at 0.75 and steps 0.1 once per second of frames.
 */
export const RENDER_SCALE_START = 0.75
export const RENDER_SCALE_STEP = 0.1
export const RENDER_SCALE_MAX = 1
export const RENDER_SCALE_FLOOR_SHORT_AXIS_PX = 1080
/** The frame budget behind every #38 acceptance: p95 at most 16.7 ms (60 frames/s). */
export const FRAME_BUDGET_MS = 16.7
/**
 * A second whose p95 frame is over 10% past the budget missed frames, so the scale steps down;
 * one within 5% of it (vsync jitter) met every frame, so it steps up. Between, it holds.
 * Placeholders until the #38 acceptance run on the reference machine.
 */
export const RENDER_SCALE_DECLINE_FRAME_MS = FRAME_BUDGET_MS * 1.1
export const RENDER_SCALE_INCLINE_FRAME_MS = FRAME_BUDGET_MS * 1.05
/**
 * Flip-flop protection (drei PerformanceMonitor's `flipflops`, #38): after this many reversals
 * the scale settles at the lower of the two it swung between and stops adapting.
 */
export const RENDER_SCALE_MAX_FLIP_FLOPS = 3
/** Frames kept per one-second window: room for a 240 Hz display. */
export const FRAME_WINDOW_CAPACITY = 256

/**
 * Post-processing (#38: one bloom pass at half the internal resolution, filmic tone mapping and a
 * vignette; no SSAO, depth of field or reflections). Light above the threshold (linear luminance)
 * blooms; the tone curve leaves everything under the knee as authored and rolls off above it,
 * so the flat palette keeps its colours and only lamps, sparks and glow saturate. Placeholders,
 * tuned by eye.
 */
export const BLOOM_THRESHOLD = 0.85
export const BLOOM_STRENGTH = 0.7
export const TONE_KNEE = 0.8
export const VIGNETTE_STRENGTH = 0.35
/** Full-screen draws after the scene: bright pass, two blur passes and the composite (cap 6). */
export const POST_PASSES = 4

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

/**
 * At most this many draw calls for the platform hub and its two bays together, one per part
 * (#38 frame budget: "platform and bays at most 30" of the 150 per frame).
 */
export const MAX_PLATFORM_DRAW_CALLS = 30

/** At most this many live ground colliders (#4, #22 acceptance, #36 acceptance 7). */
export const MAX_GROUND_COLLIDERS = 600

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
 * Dynamic lights (#38 "Lights", #48): the headlamp plus at most 4 point lights in view (bay
 * lights, the core drive, drill sparks); everything else glows through emissive colour. A point
 * light's `strength` is its share of full light at its centre, fading to nothing at its range.
 * The drill-spark light and the headlamp's light on the vehicle's own parts are placeholders,
 * tuned by eye.
 */
export const MAX_POINT_LIGHTS = 4
export const DRILL_SPARK_LIGHT = { colour: '#ffb347', rangeM: 3.5, strength: 0.9 } as const
/** The lamp seen from the camera side, so it lights the flat parts facing the camera. */
export const HEADLAMP_BODY_LIGHT = { heightM: 1.2, rangeM: 4, strength: 0.5 } as const

/**
 * Part motion (#48 motion principles): every part moves because the game state drives it. The
 * drill turns a fixed angle per drilling tick; the load (energy draw) eases over 0.1 s (#48:
 * starts and stops ease over 80-120 ms); a landing squashes the chassis 3% and a hit snaps it
 * back in 60 ms, then both settle. Only the boiler's breath and the headlamp's flicker move
 * while idle. Amplitudes and rates are placeholders, tuned by eye.
 */
export const DRILL_RADIANS_PER_TICK = 0.35
export const LOAD_EASE_SECONDS = 0.1
export const PISTON_HZ = 3
export const PISTON_TRAVEL_M = 0.03
/** One slow breath every 4 s. */
export const BOILER_BREATH_HZ = 1 / 4
export const BOILER_BREATH_M = 0.006
export const BOILER_BOB_HZ = 2.5
export const BOILER_BOB_M = 0.02
export const HEADLAMP_FLICKER_SHARE = 0.08
export const LANDING_SQUASH_SHARE = 0.03
export const LANDING_SQUASH_SECONDS = 120 / 1000
/** Falling at least this fast, then not falling, is a landing. */
export const LANDING_SPEED_MPS = 2
export const HIT_RECOIL_M = 0.04
export const HIT_SNAP_SECONDS = 0.06
export const HIT_SETTLE_SECONDS = 0.2

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
/** Cutting lining the spray is denser and paler, so casing is seen as well as heard (#41 feel). */
export const CASING_SPARK_COLOUR = '#dff6ff'
export const CASING_SPARKS_PER_SECOND = 120
/**
 * The cement spray as a casing ring is laid (#41 feel): a grey puff all round the ring's place,
 * `CEMENT_SPRAY_BEHIND_M` behind the body (the ring lags the stamp by 2.15 m, the stamp leads the
 * body by 0.5 m). Placeholders, tuned by eye.
 */
export const CEMENT_CAPACITY = 96
export const CEMENT_PUFF_COUNT = 24
export const CEMENT_SPRAY_BEHIND_M = 1.65
export const CEMENT_SPEED = 1.6
export const CEMENT_LIFE_SECONDS = 0.45
export const CEMENT_SIZE_PIXELS = 4
export const CEMENT_COLOUR = '#b9b2a4'
export const CEMENT_SEED = 0xce77
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

/**
 * `ore_whisper` (#46): while undocked, ore within 16 m of the vehicle glows at its rim even
 * behind up to 1 m of rock. Renderer only: no ore density, log or authority state changes.
 */
export const ORE_WHISPER_RANGE_TILES = 16
export const ORE_WHISPER_ROCK_TILES = 1

// The bay screens: #45 art direction, #44 icons and live preview, #39 the preview's framing.
/** #45: the smallest text on a bay screen is at least 2.2% of the screen's short axis tall. */
export const SHOP_TEXT_SHORT_AXIS_PERCENT = 2.2
/** #45: a brass shutter slides a bay screen in, and back out, over 250 ms (a fade with reduce motion). */
export const BAY_SHUTTER_MS = 250
/** #44: a bought part bolts on with a puff of steam over 400 ms; instant with reduce motion. */
export const PART_INSTALL_MS = 400
/** #39 and #44: the preview camera frames the visual vehicle at 60% of the panel height, ±5%. */
export const PREVIEW_VEHICLE_SHARE_PERCENT = 60
