/**
 * The scroll area's rail (spec #422 ruling 3, build #423): on every scroll and size change it
 * writes the thumb's place and the edge flags straight onto the elements, never through React
 * state (scrolling is per-frame work), and marks the frame awake until `SCROLL_RAIL_IDLE_MS`
 * passes with no scroll, when the sheet fades the rail out. Along `x` it reads the width, so a
 * sideways row gets the same edge flags.
 */
import { useCallback, useEffect, useRef, type RefObject } from 'react'
import { SCROLL_RAIL_IDLE_MS } from '../../constants/uiParts'
import { scrollRailOf, type ScrollMetrics, type ScrollThumb } from '../../systems/views/scrollRail'

/** The axis a scroll area scrolls along: down a list, or sideways along a row. */
export type ScrollAxis = 'x' | 'y'

interface Timer {
  current: number | null
}

export function useScrollRail(axis: ScrollAxis): {
  frameRef: RefObject<HTMLDivElement>
  viewportRef: RefObject<HTMLDivElement>
  thumbRef: RefObject<HTMLDivElement>
  markScrolled: () => void
} {
  const frameRef = useRef<HTMLDivElement>(null)
  const viewportRef = useRef<HTMLDivElement>(null)
  const thumbRef = useRef<HTMLDivElement>(null)
  const idleTimer = useRef<number | null>(null)
  const drawRail = useCallback(
    () => writeRail(frameRef.current, viewportRef.current, thumbRef.current, axis),
    [axis],
  )
  const markScrolled = useCallback(() => {
    drawRail()
    wakeRail(frameRef.current, idleTimer)
  }, [drawRail])
  useEffect(() => watchSizes(viewportRef.current, drawRail), [drawRail])
  useEffect(() => () => stopTimer(idleTimer), [])
  return { frameRef, viewportRef, thumbRef, markScrolled }
}

function writeRail(
  frame: HTMLDivElement | null,
  viewport: HTMLDivElement | null,
  thumb: HTMLDivElement | null,
  axis: ScrollAxis,
): void {
  if (frame === null || viewport === null || thumb === null) return
  const rail = scrollRailOf(metricsAlong(viewport, axis))
  frame.toggleAttribute('data-scrollable', rail.thumb !== null)
  frame.toggleAttribute('data-at-start', rail.isAtStart)
  frame.toggleAttribute('data-at-end', rail.isAtEnd)
  placeThumb(thumb, rail.thumb)
}

function metricsAlong(viewport: HTMLDivElement, axis: ScrollAxis): ScrollMetrics {
  if (axis === 'x') {
    return {
      viewportPx: viewport.clientWidth,
      contentPx: viewport.scrollWidth,
      scrollPx: viewport.scrollLeft,
    }
  }
  return {
    viewportPx: viewport.clientHeight,
    contentPx: viewport.scrollHeight,
    scrollPx: viewport.scrollTop,
  }
}

function placeThumb(thumb: HTMLDivElement, place: ScrollThumb | null): void {
  if (place === null) return
  thumb.style.transform = `translateY(${place.offsetPx}px)`
  thumb.style.height = `${place.lengthPx}px`
}

function wakeRail(frame: HTMLDivElement | null, timer: Timer): void {
  if (frame === null) return
  frame.setAttribute('data-awake', '')
  stopTimer(timer)
  timer.current = window.setTimeout(() => frame.removeAttribute('data-awake'), SCROLL_RAIL_IDLE_MS)
}

function stopTimer(timer: Timer): void {
  if (timer.current !== null) window.clearTimeout(timer.current)
  timer.current = null
}

/** Draws once now, then again whenever the viewport or its content changes size. */
function watchSizes(viewport: HTMLDivElement | null, drawRail: () => void): () => void {
  drawRail()
  if (viewport === null || typeof ResizeObserver === 'undefined') return () => {}
  const observer = new ResizeObserver(drawRail)
  observer.observe(viewport)
  if (viewport.firstElementChild !== null) observer.observe(viewport.firstElementChild)
  return () => observer.disconnect()
}
