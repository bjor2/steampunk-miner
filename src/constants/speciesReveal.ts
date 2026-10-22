/**
 * The first-contact flourish (GD ruling on #698, option 2): when the player first meets a species,
 * its rarity overlay (tint, frame, glow) arrives once over 150 to 250 ms, with a spark and a chime;
 * the skin under it never changes. Presentation numbers only: nothing reads them for play.
 */

/** How long the overlay takes to rise, inside the GD's 150 to 250 ms. */
export const RARITY_REVEAL_SECONDS = 0.2
/**
 * How far the glow overshoots its rest at the flourish's midpoint, as a multiple of it: a whole
 * number, so the shader takes it as a define. Reduce motion leaves the overshoot out.
 */
export const RARITY_REVEAL_FLARE = 2
/** Sparks thrown from the drill's nose cell as the species is met; a low request, so a blast wins. */
export const SPECIES_REVEAL_SPARKS = 12
