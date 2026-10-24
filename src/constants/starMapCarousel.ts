/**
 * The star map carousel's layout numbers (ticket 796, spec #647; the art and motion brief of ticket
 * 795, `starMapCarouselArt.json`). Presentation only: none of them reaches the authority, a save or
 * the digest. Tuned by eye against #795's mock frames.
 */

/**
 * The system backdrop is drawn at three quarters of its 1x size, 756 px wide: about 2.5 times the
 * strip's window on a phone or in the dock (~290 px), so a step pans across the system (#795: "wide
 * enough to pan across, about 3x the viewport"), where drawn whole at 90 px tall it would barely
 * move.
 */
export const STAR_MAP_STRIP_SCALE = 0.75

/**
 * The strip's window is a band this tall round the orbits' middle line: it holds the sun (120 px at
 * 1x, 90 drawn) and the 44 px selected marker, and the arcs run out of it top and bottom.
 */
export const STAR_MAP_STRIP_WINDOW_PX = 112
