/**
 * Zoom framing (#39): the player picks how many world metres fit down the screen's height (the
 * vertical extent, ticket 484), and the camera's pixels-per-metre follows from the screen, so every
 * resolution shows the same world. On a landscape screen the height is the short axis, as #39 said;
 * a portrait screen shows desktop's vertical metres and narrows only across, so a drive crosses the
 * same share of the screen a second on both (the GD's option (a) on #484). The setting keeps its
 * name, `viewShortAxisMetres`, and its 8 to 20 m band. A local presentation setting: it never
 * enters the authority, a command or the digest.
 *
 * The ease is exponential in `dt` (like the camera turn), so a zoom step lands in the same time at
 * any frame rate, and runs on the metres' logarithm so zooming in and out feel alike.
 *
 * The player's setting stays 8 to 20 m on every screen; the camera shows at most the screen
 * shape's cap (#173), so a 21:9 monitor keeps the #38 draw budget and a 16:9 one is unchanged.
 */
import { VEHICLE_COLLIDER_SIZE } from '../../constants/physics'
import {
  VIEW_HALF_DIAGONAL_MAX_M,
  VIEW_SHORT_AXIS_MAX_M,
  VIEW_SHORT_AXIS_MIN_M,
  ZOOM_EASE_SECONDS,
  ZOOM_STEP_FACTOR,
} from '../../constants/scene'

/** The share of the gap a zoom ease has closed after `ZOOM_EASE_SECONDS`. */
const EASE_SHARE_AT_END = 0.95
const EASE_TIME_CONSTANT = ZOOM_EASE_SECONDS / -Math.log(1 - EASE_SHARE_AT_END)
/** Closer than this (as a ratio) and the eased view snaps to its target. */
const SNAP_RATIO = 1e-4

/** One zoom action (#39): a local presentation setting, never a command. */
export type ZoomChange = 'in' | 'out' | 'reset'

/** What the camera shows, as the debug API reads it (#39 acceptance 1). */
export interface CameraView {
  /** Metres down the screen's height: the vertical extent (ticket 484). */
  viewShortAxisMetres: number
  /**
   * The widest vertical view this screen shape allows (#173): 20 m up to 16:9, less on wider
   * screens, 20 m on every portrait one (ticket 484).
   */
  maxViewShortAxisMetres: number
  /** Metres across the screen's width: the vertical extent times width over height (ticket 484). */
  viewHorizontalMetres: number
  /** Pixels per world metre: `camera.zoom` of the orthographic camera. */
  pixelsPerMetre: number
  /** The 0.9 m vehicle collider's projected height as a share of the vertical extent. */
  vehicleColliderShare: number
}

/** The view one `zoom_in` step gives: fewer metres, never under 8 m. */
export function zoomedIn(viewShortAxisMetres: number): number {
  return clampViewShortAxis(viewShortAxisMetres / ZOOM_STEP_FACTOR)
}

/** The view one `zoom_out` step gives: more metres, never over 20 m. */
export function zoomedOut(viewShortAxisMetres: number): number {
  return clampViewShortAxis(viewShortAxisMetres * ZOOM_STEP_FACTOR)
}

export function clampViewShortAxis(metres: number): number {
  return Math.min(VIEW_SHORT_AXIS_MAX_M, Math.max(VIEW_SHORT_AXIS_MIN_M, metres))
}

/** Why `value` cannot be the view's short axis; empty when it can. */
export function viewShortAxisProblems(value: unknown): string[] {
  const isInBand =
    typeof value === 'number' && value >= VIEW_SHORT_AXIS_MIN_M && value <= VIEW_SHORT_AXIS_MAX_M
  if (isInBand) return []
  return [
    `viewShortAxisMetres must be a number from ${VIEW_SHORT_AXIS_MIN_M} to ${VIEW_SHORT_AXIS_MAX_M}, got ${JSON.stringify(value)}`,
  ]
}

/**
 * `camera.zoom` for a screen: its height spans `viewShortAxisMetres` (ticket 484), in either
 * orientation. Landscape is unchanged, as its height is its shorter side.
 */
export function pixelsPerMetreOf(heightPixels: number, viewShortAxisMetres: number): number {
  return heightPixels / viewShortAxisMetres
}

/**
 * The widest vertical view a screen of this shape shows (#173, ticket 484): the height whose half
 * diagonal is #38's 20.40 m, never over the 20 m zoom-out, so a portrait screen (whose diagonal
 * at 20 m is at most 12.2 m half) always reaches 20 m. Before the canvas has a size, the 20 m.
 */
export function maxViewVerticalOf(widthPixels: number, heightPixels: number): number {
  if (heightPixels <= 0) return VIEW_SHORT_AXIS_MAX_M
  const aspect = widthPixels / heightPixels
  const diagonalCap = (2 * VIEW_HALF_DIAGONAL_MAX_M) / Math.sqrt(1 + aspect * aspect)
  return Math.min(VIEW_SHORT_AXIS_MAX_M, diagonalCap)
}

/**
 * Metres across the screen's width: derived from the vertical extent, never set (ticket 484).
 * Before the canvas has a size, a square view.
 */
export function viewHorizontalMetresOf(
  widthPixels: number,
  heightPixels: number,
  viewVerticalMetres: number,
): number {
  if (heightPixels <= 0) return viewVerticalMetres
  return (viewVerticalMetres * widthPixels) / heightPixels
}

/** The view the camera frames: the player's choice, held under the screen shape's cap. */
export function shownViewShortAxisOf(
  widthPixels: number,
  heightPixels: number,
  chosenMetres: number,
): number {
  return Math.min(chosenMetres, maxViewVerticalOf(widthPixels, heightPixels))
}

/** One frame of the eased view toward the player's chosen one. */
export function easeViewShortAxis(current: number, target: number, dt: number): number {
  const share = 1 - Math.exp(-dt / EASE_TIME_CONSTANT)
  const eased = current * (target / current) ** share
  return Math.abs(eased / target - 1) < SNAP_RATIO ? target : eased
}

export function cameraViewOf(
  widthPixels: number,
  heightPixels: number,
  viewShortAxisMetres: number,
): CameraView {
  return {
    viewShortAxisMetres,
    maxViewShortAxisMetres: maxViewVerticalOf(widthPixels, heightPixels),
    viewHorizontalMetres: viewHorizontalMetresOf(widthPixels, heightPixels, viewShortAxisMetres),
    pixelsPerMetre: pixelsPerMetreOf(heightPixels, viewShortAxisMetres),
    vehicleColliderShare: VEHICLE_COLLIDER_SIZE / viewShortAxisMetres,
  }
}
