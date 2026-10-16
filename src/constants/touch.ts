/**
 * The on-screen driving controls (#173, Gameplay & Vehicle's touch layout). Input only: every
 * control presses an existing action through the action map, so replay and protocol are unchanged.
 */

/** The floating stick lands anywhere in this share of the screen's width, from the thumb's side. */
export const STICK_ZONE_WIDTH_PERCENT = 40
/**
 * The zone is the lower 45% of the screen's height, ending at the bottom inset so a thumb never
 * swipes an iPhone's home bar (#470 PT-3, ticket 485; the HUD's rows keep above it, #500).
 */
export const STICK_ZONE_HEIGHT_PERCENT = 45
/**
 * Where the slices' tiles (the slot column, the fire tile) may start down the thumb's edge:
 * under the HUD strip sideways, under the compact HUD's rows held upright (ticket 485).
 */
export const TOUCH_TILE_LANE_TOP_PERCENT = { landscape: 20, portrait: 40 } as const
/** The stick's travel radius in CSS px. */
export const STICK_RADIUS_PX = 56
/** Inside this share of the travel the stick holds nothing. */
export const STICK_DEADZONE_SHARE = 0.2
/**
 * tan(22.5 degrees): the stick resolves to 8 directions of 45 degrees each, so a push within 22.5
 * degrees of an axis is that axis alone and anything further is the diagonal.
 */
export const STICK_OCTANT_SLOPE = Math.SQRT2 - 1

/**
 * The cluster's primary button (Interact) and the others, in CSS px (G&V layout): three rows
 * sideways, two on a phone held upright (ticket 485).
 */
export const INTERACT_BUTTON_PX = 72
export const CLUSTER_BUTTON_PX = 56
/** At least this much between two hit boxes. */
export const CLUSTER_GAP_PX = 8

/** Two taps this close in time and place reset the zoom like `0` does. */
export const DOUBLE_TAP_MS = 300
export const DOUBLE_TAP_SLOP_PX = 24

/** A short tick on drill contact and a pulse when the hull takes damage (G&V haptics). */
export const HAPTIC_DRILL_MS = 10
export const HAPTIC_HIT_MS = 30

/**
 * A clean tap on a HUD box (VS rule on #500): one finger, released inside the box it pressed,
 * having moved no further than this; a drag or a second finger is never a tap.
 */
export const CLEAN_TAP_SLOP_PX = 10
