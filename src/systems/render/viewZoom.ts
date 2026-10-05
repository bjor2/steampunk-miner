/**
 * Zoom framing (#39): the player picks how many world metres fit across the screen's shorter
 * axis, and the camera's pixels-per-metre follows from the screen, so every resolution shows the
 * same world. A local presentation setting: it never enters the authority, a command or the digest.
 *
 * The ease is exponential in `dt` (like the camera turn), so a zoom step lands in the same time at
 * any frame rate, and runs on the metres' logarithm so zooming in and out feel alike.
 */
import { VEHICLE_COLLIDER_SIZE } from '../../constants/physics'
import {
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
  viewShortAxisMetres: number
  /** Pixels per world metre: `camera.zoom` of the orthographic camera. */
  pixelsPerMetre: number
  /** The 0.9 m vehicle collider's projected height as a share of the short axis. */
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

/** `camera.zoom` for a screen: its shorter side spans `viewShortAxisMetres`. */
export function pixelsPerMetreOf(
  widthPixels: number,
  heightPixels: number,
  viewShortAxisMetres: number,
): number {
  return Math.min(widthPixels, heightPixels) / viewShortAxisMetres
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
    pixelsPerMetre: pixelsPerMetreOf(widthPixels, heightPixels, viewShortAxisMetres),
    vehicleColliderShare: VEHICLE_COLLIDER_SIZE / viewShortAxisMetres,
  }
}
