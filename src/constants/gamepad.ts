/**
 * The gamepad adapter's feel numbers (ticket 346). Input only: a pad press travels the key path, so
 * none of these reach the authority, the replay or the digest.
 */

/** A button, trigger or stick direction goes down at half its travel. */
export const PAD_PRESS_VALUE = 0.5
/**
 * It comes up only below this, so a stick or trigger resting near the press value does not chatter
 * presses (hysteresis, as the touch stick's deadzone does for a finger).
 */
export const PAD_RELEASE_VALUE = 0.35
/** Inside this share of its travel the right stick is idle and the gun fires along the facing. */
export const PAD_AIM_DEADZONE = 0.25
