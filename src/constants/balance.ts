/**
 * Balance placeholders for the mining curve. Not balanced: design doc section 5 (infinite
 * vertical scaling) has no numbers yet. Change them when the design does, not to satisfy a test.
 */

/** Hardness of a surface block on planet tier 0. */
export const BASE_BLOCK_HARDNESS = 1

/** Hardness multiplier per planet tier (compounding). */
export const HARDNESS_GROWTH_PER_TIER = 1.15

/** Extra hardness at the core relative to the surface of the same planet (+400% at depth 1). */
export const HARDNESS_DEPTH_SLOPE = 4

/** Highest tier whose hardness is still a finite double with this formula (1.15^n < 1.8e308). */
export const MAX_TIER_FOR_PLAIN_NUMBER = 5000
