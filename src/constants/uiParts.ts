/**
 * The shared UI parts' numbers (spec #422, GD ruling; build #423): the text budget every element
 * keeps, when the brass tooltip opens and how long the scroll rail stays before it fades.
 * Presentation only: none of these reaches a rule, a price or a digest.
 */

/**
 * A title is at most this many words: 4 by GD ruling 1 on #422, 3 since Progression's budget in
 * the GD lock on spec #678 (`copy.titleWordsMax` in designTokens.json; lowered by #680).
 */
export const TITLE_WORDS_MAX = 3
/** The one line under a title is one sentence of at most this many words ("about 12"). */
export const ONE_LINE_WORDS_MAX = 12
/** A tooltip holds at most this many short lines; never the only copy of what the player acts on. */
export const TOOLTIP_LINES_MAX = 3
/** Each tooltip line is short: at most this many words (GD answer 1 on #424, 15 Oct). */
export const TOOLTIP_LINE_WORDS_MAX = 12
/**
 * A visible fact line (price, Needs, charges, a warning, a lock reason) is at most this many words,
 * with no cap on how many an element shows; longer detail is a separate tooltip line (GD answer 2
 * on #424, 15 Oct).
 */
export const FACT_LINE_WORDS_MAX = 12

/** A mouse resting on an element opens its tooltip after this long ("about 200 ms"). */
export const TOOLTIP_HOVER_MS = 200
/** A touch held this long opens the tooltip while held; releasing it fires no action (as #164). */
export const TOOLTIP_LONG_PRESS_MS = 400
/** The tick felt when a long press opens a tooltip, under the #173 haptics setting (G&V on #164). */
export const TOOLTIP_HAPTIC_MS = 10

/** The scroll rail stays this long after the last scroll, then fades out. */
export const SCROLL_RAIL_IDLE_MS = 900
/** The riveted thumb never shrinks under this, so a long list still shows a grabbable plate. */
export const SCROLL_THUMB_MIN_PX = 24
