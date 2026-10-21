/**
 * Option B's material pop (ticket 616): the numbers of the final B bars on #442 (G&V feel bars,
 * comment 6301126158, as amended by the Horizontal Scaler, 6301134509, and the Vertical Scaler,
 * 6301142177). Presentation only: no yield, price, gate or digest reads any of them. Decimal
 * shares are written as ratios so none collides with an economy value (`economySourceScan`).
 */

/** A common pop's side, in cells (G&V: "common is 0.25 cell"). */
export const POP_COMMON_SIZE_CELLS = 1 / 4
/** Each rarity step multiplies the side by this (G&V: "×1.25"). */
export const POP_SIZE_STEP_RATIO = 5 / 4
/** The side stops growing here; from the step that reaches it the pop glints instead (HS). */
export const POP_SIZE_CAP_CELLS = 4 / 5

/** The flight to the hold anchor takes 0.35 s for a common pop up to 0.5 s at the size cap. */
export const POP_FLIGHT_SECONDS_SHORTEST = 7 / 20
export const POP_FLIGHT_SECONDS_LONGEST = 1 / 2

/** Pops a second before same-material pops merge (VS: fixed, not scaled with speed). */
export const POP_RATE_PER_SECOND = 12
/** HS: the threshold below 720 px wide, for the 360 px bench. */
export const POP_RATE_PER_SECOND_NARROW = 8
export const POP_NARROW_SCREEN_PIXELS = 720

/** Same-material pops inside this window merge into one with a count badge (VS: 0.25 s). */
export const POP_MERGE_WINDOW_SECONDS = 1 / 4

/**
 * Rare-or-better starts at this rarity step: the ores table's tier offset of `rare` (common 0,
 * uncommon 1). Such pops merge but are never dropped, and hold the reserved slots.
 */
export const POP_GUARDED_STEP_MIN = 2

/** VS: the slots of the 96-piece spray pool kept for rare-or-better, special and artefact pops. */
export const POP_RESERVED_SLOTS = 24

/** At most one special or artefact pop starts a tick; the rest queue (final B bars). */
export const POP_SPECIALS_PER_TICK = 1

/** The hold anchor: on the hull's local up, this far above the rig's drawn centre, metres. */
export const POP_HOLD_ANCHOR_UP_M = 3 / 10

/**
 * Pops draw under the enemies (0.08) and their halos (0.07), the nose riders and the hazard pips,
 * and under the collapse telegraph (0.27); the rest of the spray stays at 0.32.
 */
export const POP_Z = 3 / 50

/** The most count badges shown at once: merged pops, each lives at most 0.5 s. */
export const POP_BADGES_MOST = 16

/** A common pop's colour, brass ore; a rarer one takes its rarity's tint from the table. */
export const POP_COMMON_COLOUR = '#c9a05a'
/** Special blocks and artefacts: their own pop style (HS), an aetheric teal. */
export const POP_SPECIAL_COLOUR = '#7fe3d2'

/** A glinting pop flashes this many times a second, brightening by up to this share. */
export const POP_GLINT_PER_SECOND = 6
export const POP_GLINT_BRIGHTEN = 3 / 5
