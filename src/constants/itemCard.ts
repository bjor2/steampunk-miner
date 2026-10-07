/**
 * When an item card opens as a tooltip (Gameplay & Vehicle's input rules on #164, K7 #199): after
 * a short hover or keyboard focus with mouse and keyboard, and on a long press by touch, where a
 * tap must still act. Presentation only.
 */

/** Hover or focus shows the card after this long; hover is a shortcut, focus reaches every card. */
export const ITEM_CARD_HOVER_MS = 250
/** A touch held this long shows the card while held; releasing it fires no action. */
export const ITEM_CARD_LONG_PRESS_MS = 400
/** The tick felt when a long press opens a card, under the #173 haptics setting (G&V on #164). */
export const ITEM_CARD_HAPTIC_MS = 10
