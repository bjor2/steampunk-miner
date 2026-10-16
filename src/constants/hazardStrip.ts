/**
 * The hazard strip's numbers (TD scope g on #316, ticket 341; the GD camera lock and Gameplay's
 * proposal 6049828174 with its two amendments). Presentation only: none of them reaches the
 * authority, a save or the digest. The look numbers are placeholders tuned by eye in `npm run dev`.
 */

/**
 * The warning the strip always gives, in seconds of travel at the felt speed (GD lock: "2 s of
 * warning at any speed"); pips sit by time to arrival, 0 to this, along the strip.
 */
export const STRIP_WINDOW_SECONDS = 2

/** The look-ahead never falls under this many metres, so a slow rig still sees ahead (6049828174 4). */
export const STRIP_MIN_REACH_M = 16

/** At most this many pips at once, nearest first, so the draw cost is fixed (amendment 1). */
export const STRIP_MAX_PIPS = 8

/** The line is the bore plus one cell each side (scope g 1: "3 cells wide"). */
export const STRIP_SIDE_CELLS = 1

/** A rig this far off its sampled path has turned or been moved: the path starts again. */
export const STRIP_PATH_DRIFT_M = 1.5

/** The felt speed is an exponential average of the speed along the facing over this long (#316 scope d). */
export const FELT_SPEED_SECONDS = 0.5

/** The sampler's main-thread budget a frame (scope g 4). */
export const STRIP_FRAME_BUDGET_MS = 0.5

/**
 * The cost model the tier is chosen by, in microseconds (scope g, measured on 07df0879 and derived
 * there; `npm run bench:strip` re-measures the whole frame):
 *
 * - a tile read is `baseCellOfTile` plus the lava, cache and patch look-ups, 0.33 to 0.40 µs (M);
 * - a chunk's set-up is its ore patch list, `orePatchesNearChunk`, 0.03 to 0.06 ms (M);
 * - a lattice block (tier 3) is four cave corners and the lava blocks over it, about twenty hashes,
 *   held at two and a half tile reads until the bench says otherwise; a 3-cell line crosses at
 *   most two blocks side by side;
 * - a band warning (tier 4) is one band look-up along the path, a tile read;
 * - a metre of path is a cosine, a sine and a logarithm (D, not measured).
 */
export const STRIP_TILE_READ_US = 0.4
export const STRIP_CHUNK_SETUP_US = 60
export const STRIP_BLOCK_READ_US = 1
export const STRIP_BAND_READ_US = 0.4
export const STRIP_PATH_STEP_US = 0.1

/** Tier 4 walks the path in this many even steps, whatever its length (scope g 4, O(1)). */
export const STRIP_BAND_STEPS = 64

/** Chunks the sampler keeps set up (patch lists, deltas) before it drops the oldest. */
export const STRIP_CACHED_CHUNKS = 96

/** Metre labels switch to compact numbers from here on ("1.2k m", amendment 1 and the GD lock). */
export const STRIP_COMPACT_FROM = 1000

/**
 * The strip's place on screen, in hundredths of the short axis (`vmin`): it starts this far out
 * from the screen's middle and runs this long, whatever the zoom, speed, depth or drill level, so
 * its size is fixed per orientation (the GD lock's fixed pixel budget; VS on #500). Placeholders
 * tuned by eye.
 */
export const STRIP_INNER_VMIN = 14
export const STRIP_LENGTH_VMIN = 30
