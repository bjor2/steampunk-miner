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
