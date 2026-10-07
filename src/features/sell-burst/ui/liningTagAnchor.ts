/**
 * Where the `Lining −X` tag sits on screen: the peeled coins fly to it. Shaped like the kernel's
 * `moneyCounterAnchor`: the tag's ref is the one writer, the coin layer reads the point in its own
 * frame, and the point is shared and overwritten by the next call, so a frame allocates nothing.
 */
import type { ScreenPoint } from '../../../ui/projection/worldToScreen'

let tag: Element | null = null
const point: ScreenPoint = { x: 0, y: 0 }

export function trackLiningTag(element: Element | null): void {
  tag = element
}

/** The tag's centre in `frame`'s pixels, or null while it is not shown. */
export function liningTagPointIn(frame: Element): ScreenPoint | null {
  if (tag === null) return null
  const box = tag.getBoundingClientRect()
  const frameBox = frame.getBoundingClientRect()
  point.x = box.left + box.width / 2 - frameBox.left
  point.y = box.top + box.height / 2 - frameBox.top
  return point
}
