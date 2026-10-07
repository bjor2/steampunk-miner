/**
 * Keeps one overlay element over a world point (#208): each frame it projects the point and writes
 * a CSS `transform` on the element through its ref, never React state. It only writes styles,
 * never reads layout, and skips the write when the pixel has not moved; offscreen hides it.
 */
import { project, type Vec2 } from './worldToScreen'

/** The two styles a placement writes; an `HTMLElement` is one. */
export interface PlaceableElement {
  style: { transform: string; visibility: string }
}

/** What the element shows now, so an unchanged frame writes nothing. */
export interface ScreenPlacement {
  x: number
  y: number
  isShown: boolean
}

/** Starts hidden, as the overlay's card class does, until the first frame places it. */
export function createScreenPlacement(): ScreenPlacement {
  return { x: Number.NaN, y: Number.NaN, isShown: false }
}

export function placeAtWorldPoint(
  element: PlaceableElement,
  placement: ScreenPlacement,
  world: Vec2,
): void {
  const point = project(world)
  if (point === null) return hideOffscreen(element, placement)
  showAt(element, placement, point.x, point.y)
}

function hideOffscreen(element: PlaceableElement, placement: ScreenPlacement): void {
  if (!placement.isShown) return
  placement.isShown = false
  element.style.visibility = 'hidden'
}

function showAt(element: PlaceableElement, placement: ScreenPlacement, x: number, y: number) {
  if (!placement.isShown) element.style.visibility = 'visible'
  placement.isShown = true
  if (x === placement.x && y === placement.y) return
  placement.x = x
  placement.y = y
  element.style.transform = `translate3d(${x}px, ${y}px, 0)`
}
