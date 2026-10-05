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
/** The platform loop plays docked or within this many metres of the hub's dock point (#49). */
export const PLATFORM_RANGE_METRES = 10
/** The ambience layer's level in band 1; it rises evenly to full in band 5 (#49). */
export const AMBIENCE_BAND_1_SHARE = 0.5
/** The tension layer plays underground from this depth band on (#49), or on low energy. */
export const TENSION_FROM_BAND = 4
/** The combat layer comes in as an active enemy closes from this far (metres) to touching (#49). */
export const COMBAT_RANGE_METRES = 8
/** Stingers and the open artefact choice duck the layers by this many decibels (#49). */
export const MUSIC_DUCK_DB = 6
/** Each planet's layers are retuned by this many semitones per planet after the first (#13). */
export const PLANET_TUNING_SEMITONES = -3
/** The settings overlay steps the music volume by this share of full (#49 local settings). */
export const MUSIC_VOLUME_STEP = 0.25
