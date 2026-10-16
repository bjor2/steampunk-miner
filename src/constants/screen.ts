/**
 * How the DOM UI fits a screen (#173 "Scaling rules", Technical Director): one root UI scale, the
 * TV mode's 10-foot minimums and overscan-safe area, and the smallest touch targets. The canvas's
 * own numbers (render-scale floor, zoom cap, pillarbox) live in `scene.ts`.
 */
import { REFERENCE_VIEWPORT } from './scene'

/**
 * `--ui-scale` is `max(1, shortAxis / 800)`: 800 is the #4 reference screen's height, so text is
 * exactly today's size there, grows above it, and never shrinks on phones.
 */
export const UI_SCALE_REFERENCE_SHORT_AXIS_PX = REFERENCE_VIEWPORT.height

/**
 * TV mode designs the UI at 540 effective pixels tall (Microsoft, "Designing for Xbox and TV"), so
 * its scale is `shortAxis / 540`: today's 16 px body text becomes 2.96% of the short axis (main text
 * needs 15 epx, 2.78%) and the 12 px labels 2.22% (other text needs 12 epx).
 */
export const TV_DESIGN_SHORT_AXIS_EPX = 540

/** TV mode: other text, labels and bay-screen rows, is at least 12 epx (2.22% of the short axis). */
export const TV_MINOR_TEXT_EPX = 12

/** TV mode: a control is at least 32 epx tall (5.9% of the short axis, Microsoft's 10-foot guide). */
export const TV_CONTROL_MIN_EPX = 32

/**
 * TV mode wraps the HUD and screens in a 5% inset of each axis: 48 x 27 on a 960 x 540 design
 * (Android TV and Microsoft's TV-safe area). Most modern sets no longer overscan, so it is a toggle.
 */
export const TV_SAFE_AREA_PERCENT = 5

/** No control anywhere is under 44 x 44 CSS px, the WCAG 2.2 enhanced target size (#173). */
export const MIN_TARGET_PX = 44

/** On a coarse pointer (a finger) controls are at least 56 CSS px, #162's slot size (#173). */
export const COARSE_TARGET_PX = 56

/**
 * The HUD overlay's card cap (#208, Technical Director with the Horizontal Scaler on #178): at most
 * 16 DOM cards and labels over the picture; many small pings go on a later batched marker layer.
 */
export const OVERLAY_CARD_CAP = 16

/**
 * The compact HUD (GD ruling 5 on #500): on a finger, a short axis under the 800 px reference
 * screen lays the HUD out as icon-and-number rows; on any pointer, one under 500 px does. A
 * 1280 x 720 desktop window (short axis 720, a mouse) keeps the full HUD.
 */
export const HUD_COMPACT_COARSE_SHORT_AXIS_PX = UI_SCALE_REFERENCE_SHORT_AXIS_PX
export const HUD_COMPACT_ANY_POINTER_SHORT_AXIS_PX = 500

/**
 * The compact HUD's clear-view floors (GD ruling 2 on #500): the share of the screen no HUD box
 * and no touch button covers, 70% held upright and 65% sideways. A hint that would take the share
 * under its floor waits in the queue.
 */
export const CLEAR_VIEW_FLOOR_PORTRAIT_PERCENT = 70
export const CLEAR_VIEW_FLOOR_LANDSCAPE_PERCENT = 65

/** The compact hint chip's visible box is at most 8% of the screen's height (GD ruling 4, #500). */
export const HINT_CHIP_MAX_HEIGHT_PERCENT = 8

/**
 * The compact hint chip's height where 8% of the screen allows more (#500): one `--text-min` line
 * (15 px at 1.3) inside a 3 px double brass frame and 4 px of padding, rounded up to 40 px. The
 * dismiss control's hit area is the control minimum around a smaller glyph, outside the chip's box
 * (GD ruling 3).
 */
export const HINT_CHIP_LINE_PX = 40

/** Space between the compact HUD's rows and the hint chip under them. */
export const HINT_CHIP_GAP_PX = 8

/** How often the compact HUD re-measures its room for the hint chip (#500): 4 times a second. */
export const HINT_ROOM_POLL_MS = 250
