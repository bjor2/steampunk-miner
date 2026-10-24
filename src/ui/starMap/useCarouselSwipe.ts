/**
 * The star map carousel's swipe (ticket 796; ticket 795's motion notes): a pointer pressed on the
 * hero or the system strip and let go is judged by `swipeStepOf`, so a quick horizontal drag steps
 * the carousel and anything slanted, short or slow stays the chart's scroll. The press is held in
 * a ref, never in React state, and only the release that steps reaches the store.
 */
import { useMemo, useRef, type PointerEvent } from 'react'
import { useGameStore } from '../../store/gameStore'
import { swipeStepOf, type PointerDrag } from '../../systems/views/starMapCarousel'

interface PointerPress {
  pointerId: number
  x: number
  y: number
  atMs: number
}

export interface SwipeHandlers {
  onPointerDown(event: PointerEvent): void
  onPointerUp(event: PointerEvent): void
  onPointerCancel(): void
}

export function useCarouselSwipe(): SwipeHandlers {
  const press = useRef<PointerPress | null>(null)
  return useMemo(
    () => ({
      onPointerDown: (event) => void (press.current = pressOf(event)),
      onPointerUp: (event) => stepOnRelease(press, event),
      onPointerCancel: () => void (press.current = null),
    }),
    [],
  )
}

function stepOnRelease(press: { current: PointerPress | null }, event: PointerEvent): void {
  const drag = dragOf(press.current, event)
  press.current = null
  const step = drag === null ? null : swipeStepOf(drag)
  if (step !== null) useGameStore.getState().stepStarMapPlanet(step)
}

function pressOf(event: PointerEvent): PointerPress {
  return { pointerId: event.pointerId, x: event.clientX, y: event.clientY, atMs: event.timeStamp }
}

/** The drag from the press to this release; null for another pointer's or with no press. */
function dragOf(press: PointerPress | null, event: PointerEvent): PointerDrag | null {
  if (press === null || press.pointerId !== event.pointerId) return null
  return {
    dxPx: event.clientX - press.x,
    dyPx: event.clientY - press.y,
    ms: event.timeStamp - press.atMs,
  }
}
