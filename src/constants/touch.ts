/**
 * The on-screen driving controls (#173, Gameplay & Vehicle's touch layout). Input only: every
 * control presses an existing action through the action map, so replay and protocol are unchanged.
 */

/** The floating stick lands anywhere in this share of the screen's width, from the thumb's side. */
export const STICK_ZONE_WIDTH_PERCENT = 40
/** Below the top HUD strip: the zone starts this far down the screen. */
export const STICK_ZONE_TOP_PERCENT = 20
/** The stick's travel radius in CSS px. */
export const STICK_RADIUS_PX = 56
/** Inside this share of the travel the stick holds nothing. */
export const STICK_DEADZONE_SHARE = 0.2
/**
 * tan(22.5 degrees): the stick resolves to 8 directions of 45 degrees each, so a push within 22.5
 * degrees of an axis is that axis alone and anything further is the diagonal.
 */
export const STICK_OCTANT_SLOPE = Math.SQRT2 - 1

/** The cluster's primary button (Interact) and the others, in CSS px (G&V layout). */
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
