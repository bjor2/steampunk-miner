/**
 * World metres to canvas pixels through the orthographic camera (#208): the camera sits over a
 * world point, rolls by `angle` about the view axis (#13) and shows `pixelsPerMetre` (its zoom,
 * #39). Screen pixels run right and down from the canvas's top-left corner, as CSS does.
 *
 * The view keeps the roll's cosine and sine, so a frame computes them once and every projection
 * after it is four multiplies; projections write into a caller's point and never allocate.
 */
import type { Vector2 } from '../vehicle/localFrame'

export type Vec2 = Readonly<Vector2>

export interface ScreenPoint {
  x: number
  y: number
}

export interface ScreenView {
  centreX: number
  centreY: number
  cosAngle: number
  sinAngle: number
  pixelsPerMetre: number
  widthPixels: number
  heightPixels: number
}

export interface CameraFrame {
  centreX: number
  centreY: number
  /** Roll about the view axis, radians counter-clockwise (three's `rotation.z`). */
  angle: number
  pixelsPerMetre: number
  widthPixels: number
  heightPixels: number
}

/** No canvas yet: every point is offscreen until the first camera frame. */
export function createScreenView(): ScreenView {
  return {
    centreX: 0,
    centreY: 0,
    cosAngle: 1,
    sinAngle: 0,
    pixelsPerMetre: 0,
    widthPixels: 0,
    heightPixels: 0,
  }
}

export function aimScreenView(view: ScreenView, frame: CameraFrame): void {
  view.centreX = frame.centreX
  view.centreY = frame.centreY
  view.cosAngle = Math.cos(frame.angle)
  view.sinAngle = Math.sin(frame.angle)
  view.pixelsPerMetre = frame.pixelsPerMetre
  view.widthPixels = frame.widthPixels
  view.heightPixels = frame.heightPixels
}

/** Writes `world`'s pixel into `out`, and says whether it lies on the canvas. */
export function projectOntoScreen(view: ScreenView, world: Vec2, out: ScreenPoint): boolean {
  const dx = world.x - view.centreX
  const dy = world.y - view.centreY
  // The inverse roll: the camera turned by +angle, so the world turns by -angle under it.
  const right = dx * view.cosAngle + dy * view.sinAngle
  const up = dy * view.cosAngle - dx * view.sinAngle
  out.x = view.widthPixels / 2 + right * view.pixelsPerMetre
  out.y = view.heightPixels / 2 - up * view.pixelsPerMetre
  return isOnCanvas(view, out)
}

/** Half-open, so a canvas of no size (before the first frame) holds no point. */
function isOnCanvas(view: ScreenView, point: ScreenPoint): boolean {
  const isWithinWidth = point.x >= 0 && point.x < view.widthPixels
  return isWithinWidth && point.y >= 0 && point.y < view.heightPixels
}
