/**
 * The dynamite look's numbers, each with its origin. Tuned by eye where no decision names one;
 * none is a radius: every rule takes the blast's `radiusMm` from the detonation (#145: no fourth
 * radius ladder in the slice).
 */
import { TICKS_PER_SECOND } from '../../../../constants/physics'

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
/** Debris pieces per tile of rim, from the slice's own instanced pool. */
export const DEBRIS_PER_RIM_TILE = 1
/**
 * The debris pool: one GPU-only `InstancedMesh`, one draw call, a fixed capacity Art picks
 * (#154 "Particles and debris"). Enough for a tile of rim at every size up to the R24 cap.
 */
export const BLAST_DEBRIS_CAPACITY = 96
