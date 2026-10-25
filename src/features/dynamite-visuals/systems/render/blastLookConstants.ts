/**
 * The dynamite look's numbers, each with its origin. Tuned by eye where no decision names one;
 * none is a radius: every rule takes the blast's `radiusMm` from the detonation (#145: no fourth
 * radius ladder in the slice).
 */
import { TICKS_PER_SECOND } from '../../../../constants/physics'
import { SPARK_CAPACITY } from '../../../../constants/scene'
import { SPRAY_CAPACITY } from '../../../../constants/spray'

// --- the detonation-tick cue (#153 Game Director look 1, "Outside the radius") ---------------

/** Today's `chargeBlast` kick (`src/systems/feedback/screenEffects.ts`): the size-1 shake. */
export const SHAKE_AT_SIZE_1 = 0.8
/** Each size above 1 shakes harder, to the kernel's cap of 1 at size 6 (R10, past the screen). */
export const SHAKE_PER_SIZE_STEP = 0.04
/** The shipped charge never flashed; each size above 1 adds this share of the flash, full from 9. */
export const FLASH_PER_SIZE_STEP = 0.125
/** The flash lasts two frames (#153 look 1). */
export const FLASH_FRAMES = 2
/** Inside the radius the cue is full; it falls off to nothing at this many radii (#153). */
export const CUE_REACH_RADII = 1.5
/** The thump travels a tile a tick: a few ticks late nearby, 0.4 s late at an R24 rim (#153). */
export const THUMP_MM_PER_TICK = 1000
/** The kernel clamps the delay to a second (#213), so the rule stops there too. */
export const THUMP_DELAY_MAX_TICKS = TICKS_PER_SECOND

// --- the front: fire and dust riding the clearing's edge, debris thrown from it (#153 looks 2, 3)

/** The ring's thickness as a share of the radius, between a half tile and three tiles. */
export const RING_WIDTH_SHARE = 0.2
export const RING_WIDTH_MIN_M = 0.5
export const RING_WIDTH_MAX_M = 3
/** Fire sparks per tile of rim, from the kernel spark pool (#154: reuse the pools). */
export const FIRE_PER_RIM_TILE = 3
/** Dust motes per tile of rim, from the kernel collapse-dust pool (#154). */
export const DUST_PER_RIM_TILE = 4
/**
 * The dust pool's size: the fire pool's since D7 (ticket 866), which carved the marks layer's
 * instances (rings, crater decals, fuse sparks) out of the dust's 64 over the fire, keeping the
 * slice inside the scene-layer line (#213). The cap binds only past about a 10-tile rim.
 */
export const FRONT_DUST_CAPACITY = SPARK_CAPACITY
/** Debris pieces per tile of rim, from the kernel spray pool (ticket 348). */
export const DEBRIS_PER_RIM_TILE = 1
/**
 * The most debris one blast throws: the whole kernel spray pool, which took this slice's debris
 * pool at the same count (ticket 348; Art's 96 from #154, a tile of rim at every size up to R24).
 * The blast asks at high priority, so it always gets it.
 */
export const BLAST_DEBRIS_CAPACITY = SPRAY_CAPACITY

// --- the layer that draws them (#215): pools, motion and the flash sprite, tuned by eye --------
/** Fire rides the kernel's spark look and dust the collapse dust's (#154: reuse the pools' look). */
export const RING_FIRE_SPREAD_RADIANS = 0.6
export const RING_DUST_SPREAD_RADIANS = 0.9
/** Debris's motion, tumble and colour moved with its pool to `SPRAY_LOOKS` (ticket 348). */
/** The flash sprite at full size share: a warm disc over the clearing, under the screen veil. */
export const FLASH_SPRITE_MAX_OPACITY = 0.6
export const FLASH_SPRITE_COLOUR = '#fff1d6'
/** Its own fixed seed: presentation only, never part of the world. */
export const BLAST_FRONT_SEED = 0xb1a5
/** Front and detonation events waiting for the next frame; more in one batch are dropped. */
export const QUEUED_BLAST_EVENTS = 32

// --- the marks a charge leaves and wears (D7, ticket 866) -------------------------------------
/** Craters kept per planet, latest last; the kernel scorch keeps 16, these are the typed decals. */
export const CRATER_MARKS = 6
/** A cased crater draws its rim and its trim: at most two decal quads per crater. */
export const DECALS_PER_CRATER = 2
/** Fuse sparks alive per type pool, each type its own colour. */
export const FUSE_SPARKS_PER_TYPE = 14
/** Sparks leave the lamp in a cone this wide about the planet's radial up. */
export const FUSE_SPARK_SPREAD_RADIANS = 0.9
/** The danger ring is dashed this many times round. */
export const RING_DASHES = 24
export const RING_OPACITY = 0.85
/** The decal greys are authored around mid grey; the tint is lifted so a plate reads as its metal. */
export const DECAL_TINT_GAIN = 1.6

// --- the explosion pass (D8, ticket 868; "explosions with fire, smoke and crazy effects") -------
// Every stage is a share or a count in a fixed pool; a bigger ground radius scales the sprites
// and the shockwave ring, never a count (the TD's bounded-cost row). Tuned by eye.

/** Sizes 7 and up (the plunger sizes) flash a third frame; "white-hot flash (2–3 frames)". */
export const FLASH_FRAMES_FROM_SIZE_7 = 3
export const FIRST_THREE_FRAME_FLASH_SIZE = 7
/** The showcase variant (GD 04:53: the first blast after a charge's first purchase) flashes longer. */
export const SHOWCASE_EXTRA_FLASH_FRAMES = 2
/** With the shake switch off (the repo's reduce-motion reading) the flash sprite shows this share. */
export const REDUCED_FLASH_SHARE = 0.4
/** The flash sprite is white-hot, then the same disc burns as the fireball in the type's colours. */
export const FIREBALL_SECONDS_AT_SIZE_1 = 0.32
export const FIREBALL_SECONDS_PER_SIZE_STEP = 0.03
/** The fireball swells from this share of the ground radius to that one, within its clamp. */
export const FIREBALL_START_SHARE = 0.35
export const FIREBALL_END_SHARE = 0.8
export const FIREBALL_MIN_M = 0.6
export const FIREBALL_MAX_M = 14
export const FIREBALL_OPACITY = 0.75
/** The shockwave ring crosses the ground radius at this speed, within its duration clamp. */
export const SHOCKWAVE_METRES_PER_SECOND = 24
export const SHOCKWAVE_MIN_SECONDS = 0.25
export const SHOCKWAVE_MAX_SECONDS = 1.4
/** The ring's band as a share of the radius it has reached, between these widths. */
export const SHOCKWAVE_WIDTH_SHARE = 0.15
export const SHOCKWAVE_WIDTH_MIN_M = 0.4
export const SHOCKWAVE_WIDTH_MAX_M = 2.5
export const SHOCKWAVE_OPACITY = 0.7
/** Each count at size 1 and its step per size (HS: escalation once per size). */
export const DEBRIS_AT_SIZE_1 = 8
export const DEBRIS_PER_SIZE_STEP = 6
export const CHIPS_AT_SIZE_1 = 4
export const CHIPS_PER_SIZE_STEP = 3
export const PLUME_AT_SIZE_1 = 24
export const PLUME_PER_SIZE_STEP = 8
export const SMOKE_AT_SIZE_1 = 12
export const SMOKE_PER_SIZE_STEP = 4
export const EMBERS_AT_SIZE_1 = 10
export const EMBERS_PER_SIZE_STEP = 4
export const FIREBALL_SPARKS_AT_SIZE_1 = 16
export const FIREBALL_SPARKS_PER_SIZE_STEP = 6
/** Each Blast Radius band (one per tenfold of the level, HS) adds this share to every count. */
export const BAND_COUNT_SHARE = 0.1
/** The dust plume hangs this long at size 1, longer per size and per band ("longer plume"). */
export const PLUME_SECONDS_AT_SIZE_1 = 0.9
export const PLUME_SECONDS_PER_SIZE_STEP = 0.12
export const PLUME_SECONDS_PER_BAND = 0.1
export const SMOKE_SECONDS_AT_SIZE_1 = 1.6
export const SMOKE_SECONDS_PER_SIZE_STEP = 0.2
export const EMBER_SECONDS_AT_SIZE_1 = 1.2
export const EMBER_SECONDS_PER_SIZE_STEP = 0.1
export const FIREBALL_SPARK_SECONDS = 0.45
/** How the stages' pieces leave the blast, metres a second; smoke drifts up the planet's radial. */
export const PLUME_METRES_PER_SECOND = 3.2
export const SMOKE_METRES_PER_SECOND = 1.1
export const EMBER_METRES_PER_SECOND = 2.4
export const CHIP_METRES_PER_SECOND = 7
export const FIREBALL_SPARK_METRES_PER_SECOND = 5
export const PLUME_SPREAD_RADIANS = 1.2
export const SMOKE_SPREAD_RADIANS = 0.7
export const EMBER_SPREAD_RADIANS = 1.4
export const CHIP_SPREAD_RADIANS = 0.6
/** Smoke is the type's soot lifted toward this grey; dust is the collapse dust's tan. */
export const SMOKE_GREY = '#5a5551'
export const SMOKE_SOOT_SHARE = 0.55
export const EMBER_COLOUR = '#ff7a2a'
/** A collapse that a blast rolled falls as dull dust toward the planet's centre, never fire. */
export const FALL_DUST_PER_BLOCK = 24
export const FALL_CHIPS_PER_BLOCK = 6
export const FALL_SECONDS = 1.1
export const FALL_SPREAD_RADIANS = 0.5
/** A cased crater's rim glows in the laid grade's tint as the smoke clears, then settles. */
export const RIM_GLOW_PEAK_GAIN = 1.3
export const RIM_GLOW_RISE_TICKS = 36
export const RIM_GLOW_TICKS = 180
/** The showcase banner holds this long on the authority's clock. */
export const SHOWCASE_BANNER_TICKS = 150
/** The fuse's sparks build to this many times their rate over its last seconds. */
export const FUSE_BUILD_PEAK = 3
export const FUSE_BUILD_SECONDS = 3
/** Live blasts whose fronts keep their own seeded random; a fifth falls back to the fixed seed. */
export const SEEDED_BLAST_SLOTS = 4
/** Collapse falls waiting for the next frame. */
export const QUEUED_FALLS = 16
/** Chips fly this long; the collapse fall's dust takes the dust colour darkened to this share. */
export const CHIP_SECONDS = 0.8
export const FALL_CHIP_SHADE = 0.6
