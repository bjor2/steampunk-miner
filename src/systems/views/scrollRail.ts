/**
 * The steampunk scroll area's rail (spec #422 ruling 3, build #423): where the riveted thumb sits
 * on the brass rail for a viewport's scroll position, and which edges the content has reached, so
 * the edge fades show only where more content hides. The rail lies over the viewport's edge and
 * takes no width of its own: nothing here moves the content. Pure, in CSS pixels.
 */
import { SCROLL_THUMB_MIN_PX } from '../../constants/uiParts'

export interface ScrollMetrics {
  /** The viewport's inner length along the scroll axis. */
  readonly viewportPx: number
  /** The content's whole length along the scroll axis. */
  readonly contentPx: number
  /** How far the content has scrolled. */
  readonly scrollPx: number
}

export interface ScrollThumb {
  /** From the rail's start, inside `[0, viewportPx - lengthPx]`. */
  readonly offsetPx: number
  readonly lengthPx: number
}

export interface ScrollRail {
  /** Null while the content fits, when the rail has nothing to show. */
  readonly thumb: ScrollThumb | null
  readonly isAtStart: boolean
  readonly isAtEnd: boolean
}

export function scrollRailOf(metrics: ScrollMetrics): ScrollRail {
  const hidden = hiddenLengthOf(metrics)
  return {
    thumb: hidden <= 0 ? null : thumbOf(metrics, hidden),
    isAtStart: metrics.scrollPx <= 0,
    isAtEnd: metrics.scrollPx >= hidden,
  }
}

/** The thumb is the viewport's share of the content, never under the minimum, and moves with it. */
function thumbOf(metrics: ScrollMetrics, hiddenPx: number): ScrollThumb {
  const share = metrics.viewportPx / metrics.contentPx
  const lengthPx = Math.min(
    metrics.viewportPx,
    Math.max(SCROLL_THUMB_MIN_PX, share * metrics.viewportPx),
  )
  const travelPx = metrics.viewportPx - lengthPx
  const progress = Math.min(1, Math.max(0, metrics.scrollPx / hiddenPx))
  return { offsetPx: travelPx * progress, lengthPx }
}

function hiddenLengthOf(metrics: ScrollMetrics): number {
  return metrics.contentPx - metrics.viewportPx
}
