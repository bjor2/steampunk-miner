/**
 * How the game fits the screen it is shown on (#173 "Scaling rules"): the stage the canvas and the
 * DOM UI share (pillarboxed past 64:27), the orientation it is held in (#470 PT-1, ticket 483), one
 * UI scale from the short axis, TV mode's 10-foot scale and 5% safe area, and the smallest control.
 * The shell writes the result as CSS custom properties and a `data-orientation` attribute on the
 * page root; every size and layout switch in the UI's style sheets follows from them. Presentation
 * only.
 */
import {
  COARSE_TARGET_PX,
  HINT_CHIP_MAX_HEIGHT_PERCENT,
  HUD_COMPACT_ANY_POINTER_SHORT_AXIS_PX,
  HUD_COMPACT_COARSE_SHORT_AXIS_PX,
  MIN_TARGET_PX,
  TV_MINOR_TEXT_EPX,
  TV_CONTROL_MIN_EPX,
  TV_DESIGN_SHORT_AXIS_EPX,
  TV_SAFE_AREA_PERCENT,
  UI_SCALE_REFERENCE_SHORT_AXIS_PX,
} from '../../constants/screen'
import { SHOP_TEXT_REFERENCE_PX, STAGE_MAX_ASPECT } from '../../constants/scene'
import { layoutKindOf } from './designSystem'
import { vehicleKeepClearOf } from './hudClearView'

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

/** Held upright (taller than wide) or sideways; a square window counts as sideways. */
export type StageOrientation = 'portrait' | 'landscape'

/**
 * How the in-run HUD is laid out (GD ruling 5 on #500): `full` is the desktop HUD with its words,
 * `compact` the phone's icon-and-number rows with each word in the box's tap card. One HUD either
 * way; only its layout follows the screen.
 */
export type HudDensity = 'full' | 'compact'

export interface ScreenLayout {
  stage: StageRect
  /** `data-orientation` on the root: the one source panels switch their layout on. */
  orientation: StageOrientation
  /** `data-hud-density` on the root: the one source the HUD switches its layout on. */
  hudDensity: HudDensity
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
    orientation: orientationOf(screen.widthPixels, screen.heightPixels),
    hudDensity: hudDensityOf(shortAxis, screen.isCoarsePointer),
    uiScale: uiScaleOf(shortAxis, isTvMode),
    tvSafeInset: tvSafeInsetOf(stage, isTvMode),
    controlMinPixels: controlMinPixelsOf(shortAxis, screen.isCoarsePointer, isTvMode),
    shopTextPixels: shopTextPixelsOf(shortAxis, isTvMode),
  }
}

/**
 * The whole window, or a centred 64:27 band of it on a wider screen (#173 pillarbox). A portrait
 * window is never wider than 64:27, so the stage is always the whole of it.
 */
export function stageRectOf(widthPixels: number, heightPixels: number): StageRect {
  const width = Math.min(widthPixels, heightPixels * STAGE_MAX_ASPECT)
  return { left: (widthPixels - width) / 2, width, height: heightPixels }
}

export function orientationOf(widthPixels: number, heightPixels: number): StageOrientation {
  return heightPixels > widthPixels ? 'portrait' : 'landscape'
}

/** Compact on a finger under the 800 px short axis, or on any pointer under 500 (#500). */
export function hudDensityOf(shortAxisPixels: number, isCoarsePointer: boolean): HudDensity {
  if (shortAxisPixels < HUD_COMPACT_ANY_POINTER_SHORT_AXIS_PX) return 'compact'
  return isCoarsePointer && shortAxisPixels < HUD_COMPACT_COARSE_SHORT_AXIS_PX ? 'compact' : 'full'
}

/**
 * `max(1, shortAxis / 800)`, or the 10-foot `max(1, shortAxis / 540)` in TV mode. The short axis
 * is the width held upright and the height held sideways, so a phone keeps its scale through a
 * rotation. A 390 px short axis stays at 1 either way up: shrinking would take text under #422's
 * readable floor (`--text-min`, Bjor's "can't read the text") and break #173's "never shrinks on
 * phones" text check in every cell, so portrait panels reflow to the 390 px width instead.
 */
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
    ...safeAreaStyleOf(layout.tvSafeInset),
    '--control-min': `${layout.controlMinPixels}px`,
    // Hundredths of a pixel, so 17.6 x 1.35 does not reach the sheet as 23.760000000000005.
    '--shop-text': `${layout.shopTextPixels.toFixed(2)}px`,
    '--hint-chip-max-height': `${hintChipMaxHeightOf(layout.stage.height).toFixed(2)}px`,
    ...vehicleClearStyleOf(layout.stage),
  }
}

/**
 * `--vehicle-clear-left` and `--vehicle-clear-top`: where the vehicle's keep-clear square starts
 * (#500), so the compact HUD's side columns and top rows stop short of it.
 */
function vehicleClearStyleOf(stage: StageRect): Record<string, string> {
  const rect = vehicleKeepClearOf({ width: stage.width, height: stage.height })
  return {
    '--vehicle-clear-left': `${rect.left.toFixed(2)}px`,
    '--vehicle-clear-top': `${rect.top.toFixed(2)}px`,
  }
}

/** The compact hint chip's tallest visible box: 8% of the screen's height (GD ruling 4, #500). */
export function hintChipMaxHeightOf(heightPixels: number): number {
  return (heightPixels * HINT_CHIP_MAX_HEIGHT_PERCENT) / PERCENT
}

/**
 * The layout as the attributes on the page root: what panels and the HUD switch layout on.
 * `data-layout` is the design system's phone or desktop (ticket 682), read from the density so
 * the two never disagree; `tokens.css` swaps the layout tokens on it.
 */
export function screenAttributesOf(layout: ScreenLayout): Record<string, string> {
  return {
    'data-orientation': layout.orientation,
    'data-hud-density': layout.hudDensity,
    'data-layout': layoutKindOf(layout.hudDensity),
  }
}

/**
 * `--safe-*`: each side's inset the HUD and screens keep clear, the larger of the device's notch
 * or home bar (`env(safe-area-inset-*)`) and TV mode's overscan, so every layer reads one source.
 */
function safeAreaStyleOf(tvSafeInset: { x: number; y: number }): Record<string, string> {
  return {
    '--safe-top': `max(env(safe-area-inset-top), ${tvSafeInset.y}px)`,
    '--safe-right': `max(env(safe-area-inset-right), ${tvSafeInset.x}px)`,
    '--safe-bottom': `max(env(safe-area-inset-bottom), ${tvSafeInset.y}px)`,
    '--safe-left': `max(env(safe-area-inset-left), ${tvSafeInset.x}px)`,
  }
}
