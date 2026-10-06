/**
 * How the game fits the screen it is shown on (#173 "Scaling rules"): the stage the canvas and the
 * DOM UI share (pillarboxed past 64:27), one UI scale from the short axis, TV mode's 10-foot scale
 * and 5% safe area, and the smallest control. The shell writes the result as CSS custom properties
 * on the page root; every size in the UI's style sheets follows from them. Presentation only.
 */
import {
  COARSE_TARGET_PX,
  MIN_TARGET_PX,
  TV_MINOR_TEXT_EPX,
  TV_CONTROL_MIN_EPX,
  TV_DESIGN_SHORT_AXIS_EPX,
  TV_SAFE_AREA_PERCENT,
  UI_SCALE_REFERENCE_SHORT_AXIS_PX,
} from '../../constants/screen'
import { SHOP_TEXT_REFERENCE_PX, STAGE_MAX_ASPECT } from '../../constants/scene'

/** The window in CSS pixels and whether its primary pointer is a finger, as the shell reads it. */
export interface ScreenReading {
  widthPixels: number
  heightPixels: number
  isCoarsePointer: boolean
}

/** The canvas's rectangle in the window, in CSS pixels: full height, centred across. */
export interface StageRect {
  left: number
  width: number
  height: number
}

export interface ScreenLayout {
  stage: StageRect
  /** `--ui-scale`: every rem and spacing token is multiplied by it. */
  uiScale: number
  /** TV mode's overscan-safe inset of the stage, in CSS pixels; 0 with TV mode off. */
  tvSafeInset: { x: number; y: number }
  /** The smallest width and height of any control, in CSS pixels. */
  controlMinPixels: number
  /** Every text on a bay screen, labels and titles included (#45 2.2%, #173). */
  shopTextPixels: number
}

const PERCENT = 100

export function screenLayoutOf(screen: ScreenReading, isTvMode: boolean): ScreenLayout {
  const stage = stageRectOf(screen.widthPixels, screen.heightPixels)
  const shortAxis = Math.min(stage.width, stage.height)
  return {
    stage,
    uiScale: uiScaleOf(shortAxis, isTvMode),
    tvSafeInset: tvSafeInsetOf(stage, isTvMode),
    controlMinPixels: controlMinPixelsOf(shortAxis, screen.isCoarsePointer, isTvMode),
    shopTextPixels: shopTextPixelsOf(shortAxis, isTvMode),
  }
}

/** The whole window, or a centred 64:27 band of it on a wider screen (#173 pillarbox). */
export function stageRectOf(widthPixels: number, heightPixels: number): StageRect {
  const width = Math.min(widthPixels, heightPixels * STAGE_MAX_ASPECT)
  return { left: (widthPixels - width) / 2, width, height: heightPixels }
}

/** `max(1, shortAxis / 800)`, or the 10-foot `max(1, shortAxis / 540)` in TV mode. */
export function uiScaleOf(shortAxisPixels: number, isTvMode: boolean): number {
  const designShortAxis = isTvMode ? TV_DESIGN_SHORT_AXIS_EPX : UI_SCALE_REFERENCE_SHORT_AXIS_PX
  return Math.max(1, shortAxisPixels / designShortAxis)
}

/** 44 px, 56 on a finger, and in TV mode at least 32 of the 540 design pixels (5.9%). */
export function controlMinPixelsOf(
  shortAxisPixels: number,
  isCoarsePointer: boolean,
  isTvMode: boolean,
): number {
  const target = isCoarsePointer ? COARSE_TARGET_PX : MIN_TARGET_PX
  if (!isTvMode) return target
  return Math.max(target, (shortAxisPixels * TV_CONTROL_MIN_EPX) / TV_DESIGN_SHORT_AXIS_EPX)
}

/**
 * #45's 2.2% of the short axis from the 800 px reference screen up, the reference's 17.6 px on a
 * phone, and in TV mode at least the 12 design pixels of 540 (2.22%) other text needs. The bay
 * screens' rows were laid out for 2.2%, so TV mode lifts them only to its minimum.
 */
export function shopTextPixelsOf(shortAxisPixels: number, isTvMode: boolean): number {
  const scaled = SHOP_TEXT_REFERENCE_PX * uiScaleOf(shortAxisPixels, false)
  if (!isTvMode) return scaled
  return Math.max(scaled, (shortAxisPixels * TV_MINOR_TEXT_EPX) / TV_DESIGN_SHORT_AXIS_EPX)
}

function tvSafeInsetOf(stage: StageRect, isTvMode: boolean): { x: number; y: number } {
  if (!isTvMode) return { x: 0, y: 0 }
  return {
    x: (stage.width * TV_SAFE_AREA_PERCENT) / PERCENT,
    y: (stage.height * TV_SAFE_AREA_PERCENT) / PERCENT,
  }
}

/** The layout as the CSS custom properties the style sheets read. */
export function screenStyleOf(layout: ScreenLayout): Record<string, string> {
  return {
    '--ui-scale': String(layout.uiScale),
    '--stage-left': `${layout.stage.left}px`,
    '--stage-width': `${layout.stage.width}px`,
    '--tv-safe-x': `${layout.tvSafeInset.x}px`,
    '--tv-safe-y': `${layout.tvSafeInset.y}px`,
    '--control-min': `${layout.controlMinPixels}px`,
    // Hundredths of a pixel, so 17.6 x 1.35 does not reach the sheet as 23.760000000000005.
    '--shop-text': `${layout.shopTextPixels.toFixed(2)}px`,
  }
}
