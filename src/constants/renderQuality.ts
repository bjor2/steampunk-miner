/**
 * The render quality presets and their degradation ladder (TD #470 section 2.4, ticket 477; #173
 * section 3: "particle counts are halved, and background parallax layers are reduced" on phones).
 * Presentation numbers only: none reaches the authority, a command or the digest. Placeholders,
 * tuned by eye and by the real-device table (#482).
 */

/** Half the particles a full preset emits: #173's phone cut, and the ladder's third rung. */
export const REDUCED_PARTICLE_SHARE = 1 / 2
/**
 * The background drawn behind the ground (#13 "Parallax and background"): the sky colour and the
 * planet's sky band. A reduced background keeps only the sky colour.
 */
export const FULL_BACKGROUND_LAYERS = 2
export const REDUCED_BACKGROUND_LAYERS = 1
/** Every second refresh of a 60 Hz display, for a GPU that cannot hold 60 frames a second. */
export const SLOW_RENDER_FPS_CAP = 30
/** The low preset's render scale ceiling: a lite GPU never pays for a native render. */
export const LOW_RENDER_SCALE_CAP = 3 / 4

/**
 * After its first settle the render scale steps at most this often, so a GPU that flaps does not
 * reallocate the full-size targets every second; the quality ladder keeps the same pace.
 */
export const RENDER_SCALE_SETTLED_STEP_SECONDS = 2
/**
 * A settled render scale, or a ladder rung held through this many met seconds in a row, tries the
 * better look again (a phone that cooled down, a tab that stopped competing).
 */
export const RENDER_QUALITY_REPROBE_SECONDS = 60
