/**
 * The scroll area's rail (spec #422 ruling 3, build #423): on every scroll and size change it
 * writes the thumb's place and the edge flags straight onto the elements, never through React
 * state (scrolling is per-frame work), and marks the frame awake until `SCROLL_RAIL_IDLE_MS`
 * passes with no scroll, when the sheet fades the rail out.
 */
import { useCallback, useEffect, useRef, type RefObject } from 'react'
import { SCROLL_RAIL_IDLE_MS } from '../../constants/uiParts'
import { scrollRailOf, type ScrollThumb } from '../../systems/views/scrollRail'

interface Timer {
  current: number | null
}

export function useScrollRail(): {
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
    () => writeRail(frameRef.current, viewportRef.current, thumbRef.current),
    [],
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
): void {
  if (frame === null || viewport === null || thumb === null) return
  const rail = scrollRailOf({
    viewportPx: viewport.clientHeight,
    contentPx: viewport.scrollHeight,
    scrollPx: viewport.scrollTop,
  })
  frame.toggleAttribute('data-scrollable', rail.thumb !== null)
  frame.toggleAttribute('data-at-start', rail.isAtStart)
  frame.toggleAttribute('data-at-end', rail.isAtEnd)
  placeThumb(thumb, rail.thumb)
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
