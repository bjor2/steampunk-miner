/**
 * Two fingers on the tree's map (spec #470 section "Tech tree", PT-5): a pinch scales the map by
 * how far the fingers spread, and the map point under their midpoint stays under it. The map
 * never shrinks below the size it is laid out at, where every node is a 48 px target (#470's
 * floor) and its text at #422's readable floor, and grows to at most twice that. Nothing here
 * touches the DOM.
 */

/** The laid-out map: every target at least 48 px and every text at its readable floor. */
export const MAP_ZOOM_MIN = 1

/** Twice the laid-out size: a node's name reads from arm's length on a phone. */
export const MAP_ZOOM_MAX = 2

export interface MapPoint {
  x: number
  y: number
}

/** The zoom a pinch reaches: the start zoom scaled by the fingers' spread, kept in range. */
export function pinchZoomOf(startZoom: number, startSpan: number, span: number): number {
  if (startSpan <= 0) return startZoom
  return Math.min(MAP_ZOOM_MAX, Math.max(MAP_ZOOM_MIN, (startZoom * span) / startSpan))
}

/** How far apart two fingers are, in CSS px (`Math.sqrt` is exact; `hypot` is not, #5). */
export function spanOf(a: MapPoint, b: MapPoint): number {
  const dx = a.x - b.x
  const dy = a.y - b.y
  return Math.sqrt(dx * dx + dy * dy)
}

export function midpointOf(a: MapPoint, b: MapPoint): MapPoint {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
}

/**
 * The scroll offset along one axis that keeps the content under `focal` (px from the viewport's
 * edge) in place when the map scales by `ratio`; never before the map's start.
 */
export function anchoredScrollOf(scroll: number, focal: number, ratio: number): number {
  return Math.max(0, (scroll + focal) * ratio - focal)
}
