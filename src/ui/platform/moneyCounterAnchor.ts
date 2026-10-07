/**
 * Where the bay header's money counter sits on screen (ticket 220): the target the sell burst's
 * coins fly to. The header's counter is the one writer, through its ref; a slice reads the point
 * in the frame it draws in. A frame registry, never React or the store, and allocation-free like
 * `project`: the point it returns is shared and the next call overwrites it.
 */
import type { ScreenPoint } from '../projection/worldToScreen'

let counter: Element | null = null
const point: ScreenPoint = { x: 0, y: 0 }

/** The counter's ref: the element while a bay header shows, null once it unmounts. */
export function trackMoneyCounter(element: Element | null): void {
  counter = element
}

/**
 * The counter's centre in `frame`'s pixels, or null while no bay header shows. Pass the `above`
 * bay panel layer's element to get canvas pixels, the frame `project` places world points in.
 */
export function moneyCounterPointIn(frame: Element): ScreenPoint | null {
  if (counter === null) return null
  return centreOfIn(counter.getBoundingClientRect(), frame.getBoundingClientRect())
}

function centreOfIn(box: DOMRect, frameBox: DOMRect): ScreenPoint {
  point.x = box.left + box.width / 2 - frameBox.left
  point.y = box.top + box.height / 2 - frameBox.top
  return point
}
