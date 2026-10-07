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
/**
 * The zoom-out cap by screen shape (#173 "Zoom"): the drawn set follows half the screen diagonal
 * (the camera rolls), and #38's 48-block and 150-draw budget was set for a 16:9 view at 20 m, whose
 * half diagonal is 20.40 m. Wider screens zoom out less: 15.86 m at 21:9, 17.10 m at 19.5:9.
 */
export const VIEW_HALF_DIAGONAL_MAX_M = 20.4
/**
 * Past this aspect (2560 x 1080's 64:27) the canvas is pillarboxed (#173): at 32:9 the diagonal cap
 * would fall to 11.04 m, under the 12 m default.
 */
export const STAGE_MAX_ASPECT = 64 / 27
/** A whole-number ratio, so the economy scan never mistakes it for a price ratio. */
export const ZOOM_STEP_FACTOR = 5 / 4
export const ZOOM_EASE_SECONDS = 0.2
/**
 * `useFrame` order (#208): the scene's own frame work at priority 0 moves the camera and the
 * bodies, then the projector feed publishes the frame about to be drawn, then the pipeline draws
 * it. A positive priority takes R3F's render over, which the pipeline does anyway.
 */
export const PROJECTOR_FRAME_PRIORITY = 1
export const RENDER_FRAME_PRIORITY = 2

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
/**
 * The canvas's device-pixel-ratio range (#173 "Canvas"): R3F's default made explicit, so a DPR-3
 * phone renders 2x, not 2.25x the pixels of DPR 2. The render scale multiplies the capped ratio.
 */
export const CANVAS_DPR_RANGE: readonly [number, number] = [1, 2]
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
 * A frame longer than this is a hitch the perf log counts as `longTasks` (#121): the W3C Long
 * Tasks API's threshold, 50 ms of main thread work without a break.
 */
export const LONG_FRAME_MS = 50
/** Seconds of frames between two `memory_sample` lines (#121, logging strategy section 2). */
export const MEMORY_SAMPLE_SECONDS = 10

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
 * At most this many parts across every `platform-*` asset, one draw call each (#38 frame budget,
 * raised by the TD on #170 for the pad growth: the base set of the buildings and the Refinery at
 * most 30, each in-place add-on 2 and each counter building 4). The real cap is per view: the
 * dock camera frames one building, and a frame stays within the 150 draw calls of #38.
 */
export const MAX_PLATFORM_PARTS = 48

/**
 * What the slices' scene layers may draw at most, all together (TD and GD lock on #213): a
 * seal-time draw envelope carved from #38's 150 draw calls, separate from #154's 2 ms rebuild line.
 * 27 draw calls is what is left after #38's split (ground 2, vehicle 30, enemies 3, particles 4,
 * platform 48, post 6) and one co-op vehicle's 30; a pooled `InstancedMesh` counts as one. 1024
 * instances, about 10x #145a's debris pool, holds until a reference-machine GPU run measures fill.
 */
export const SCENE_LAYER_LINE = { drawCalls: 27, instances: 1024 } as const

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
/**
 * The collapse telegraph (#43 Sequence 1, #41 feel: cracks, falling dust and a rising rumble for the
 * 1.0 s before a refill): each collapsing block grows a crack of `CRACKS_PER_BLOCK` segments as its
 * warning runs, and sheds dust from its top edge at a rate rising from `COLLAPSE_DUST_START` to
 * `COLLAPSE_DUST_FULL` per second. At most `COLLAPSE_TELEGRAPH_BLOCKS` blocks are drawn at once.
 * Placeholders, tuned by eye.
 */
export const COLLAPSE_TELEGRAPH_BLOCKS = 24
export const CRACKS_PER_BLOCK = 7
export const CRACK_SEGMENT_M = 0.6
/** Each crack segment turns at most this far from the last. */
export const CRACK_TURN_RADIANS = 0.8
export const CRACK_COLOUR = '#1b130d'
export const COLLAPSE_DUST_CAPACITY = 320
export const COLLAPSE_DUST_START = 6
export const COLLAPSE_DUST_FULL = 60
export const COLLAPSE_DUST_FALL_SPEED = 1.8
export const COLLAPSE_DUST_SPREAD_RADIANS = 0.3
export const COLLAPSE_DUST_LIFE_SECONDS = 0.9
export const COLLAPSE_DUST_SIZE_PIXELS = 3
export const COLLAPSE_DUST_COLOUR = '#8d7f6a'
export const COLLAPSE_DUST_SEED = 0xd057
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
/**
 * #173: that 2.2% of the 800 px reference short axis (17.6 px), set times `--ui-scale`, so it is
 * 2.2% on every screen from 800 px up and keeps 17.6 px on a phone.
 */
export const SHOP_TEXT_REFERENCE_PX =
  (SHOP_TEXT_SHORT_AXIS_PERCENT / 100) * REFERENCE_VIEWPORT.height
/** #45: a brass shutter slides a bay screen in, and back out, over 250 ms (a fade with reduce motion). */
export const BAY_SHUTTER_MS = 250
/** #44: a bought part bolts on with a puff of steam over 400 ms; instant with reduce motion. */
export const PART_INSTALL_MS = 400
/** #39 and #44: the preview camera frames the visual vehicle at 60% of the panel height, ±5%. */
export const PREVIEW_VEHICLE_SHARE_PERCENT = 60

/**
 * #107/#108: the `auto_guns` barrel's three looks start at these gun levels (1-5 plain, 6-11
 * jacketed, 12-16 twin), the split #108 proposed over the track's 16 levels. The barrel swings
 * to its aim at most this fast; placeholders, tuned by eye.
 */
export const GUN_LOOK_FIRST_LEVELS: readonly number[] = [1, 6, 12]
export const GUN_TURN_RADIANS_PER_SECOND = 9

/**
 * The Refinery bay's smoke while a batch runs (#105, #106 art: procedural, #51), rising from its
 * stack top at `REFINERY_STACK_TOP_M` in the bay's frame (the art's documented point). Placeholders,
 * tuned by eye; presentation only.
 */
export const REFINERY_STACK_TOP_M = [-0.75, 2.98] as const
export const REFINERY_SMOKE_CAPACITY = 64
export const REFINERY_SMOKE_PER_SECOND = 14
export const REFINERY_SMOKE_SPEED = 0.7
export const REFINERY_SMOKE_SPREAD_RADIANS = 0.35
export const REFINERY_SMOKE_LIFE_SECONDS = 2.4
export const REFINERY_SMOKE_SIZE_PIXELS = 6
export const REFINERY_SMOKE_COLOUR = '#8a817a'
export const REFINERY_SMOKE_SEED = 0x5e0c

/**
 * #109/#110: a planted charge's fuse lamp blinks on and off this often (the art's `fuse-lamp`
 * part, shown and hidden), faster in the last second so the blow reads. Up to this many charges
 * are drawn at once (one live charge per vehicle). Placeholders, tuned by eye.
 */
export const FUSE_BLINK_SECONDS = 0.24
export const FUSE_BLINK_LAST_SECOND_SECONDS = 0.1
export const PLANTED_CHARGE_SLOTS = 4

/**
 * #109 "the blast leaves scorch marks on the tunnel edge" (`fx-blast-scorch`, a code shader):
 * soot darkest in a ring at the blast's 2.5-tile edge, fading inward over `SCORCH_INNER_FADE_M`
 * and outward over `SCORCH_OUTER_FADE_M`. The last `SCORCH_SLOTS` blasts on the planet keep
 * theirs. Placeholders, tuned by eye; presentation only.
 */
export const SCORCH_SLOTS = 16
export const SCORCH_INNER_FADE_M = 1.2
export const SCORCH_OUTER_FADE_M = 1.3
export const SCORCH_DARKNESS = 0.9
export const SCORCH_COLOUR = '#17110c'

/**
 * The heat shimmer (#113, `fx-heat-shimmer`): a square of haze this many metres across centred on
 * the 0.9 m body, so it rises past the hull's edges, drawn over every part of the vehicle.
 */
export const HEAT_SHIMMER_SIZE_M = 1.6
export const HEAT_SHIMMER_Z = 0.2
