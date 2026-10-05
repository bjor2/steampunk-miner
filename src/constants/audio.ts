/**
 * Audio numbers (#13 "Audio direction": mechanical, layered and parametric; programmatic
 * placeholders until the commissioned sounds and music land). Frequencies in Hz, gains 0 to 1,
 * times in seconds. Placeholders, tuned by ear.
 */

/** Tier 1's pickup chime: A5. The chime climbs the major scale from here, one degree a tier. */
export const CHIME_BASE_HZ = 880
/** The chime stops climbing three octaves up, so endless tiers stay audible (tier 22 and on). */
export const CHIME_MAX_OCTAVES = 3

/** The drill motor: it sings at `DRILL_FREE_HZ` biting soft rock and strains down toward
 * `DRILL_LOADED_HZ` as the tile takes longer; `DRILL_HALF_LOAD_SECONDS` of tile time is half load. */
export const DRILL_FREE_HZ = 220
export const DRILL_LOADED_HZ = 90
export const DRILL_HALF_LOAD_SECONDS = 1
export const DRILL_GAIN_MIN = 0.1
export const DRILL_GAIN_MAX = 0.22

/** The engine chug: puffs per second rise with speed up to `ENGINE_TOP_SPEED` m/s. */
export const ENGINE_IDLE_PUFFS = 2
export const ENGINE_TOP_PUFFS = 9
export const ENGINE_TOP_SPEED = 16
export const ENGINE_GAIN_IDLE = 0.04
export const ENGINE_GAIN_TOP = 0.13

/** Steam hiss of the lift thruster. */
export const STEAM_GAIN = 0.1

/** Loops crossfade over about this long: the same share closes in the same time at any fps. */
export const LAYER_FADE_SECONDS = 1.5
/** Underground, the tension layer rises over this many tiles below the surface. */
export const TENSION_FULL_DEPTH_TILES = 120
/** The combat layer comes in as an active enemy closes from this far (metres) to touching. */
export const COMBAT_RANGE_METRES = 12
/** Each planet's layers are retuned by this many semitones per planet after the first (#13). */
export const PLANET_TUNING_SEMITONES = -3
