/**
 * Pan the planet ruler by dragging it or with the arrow keys (#161 section 4). The drag lives in a
 * ref and moves the element's own scroll position, so panning never goes through React state.
 */
import { useRef, type KeyboardEvent, type PointerEvent } from 'react'

/** How far one arrow key press pans, in CSS pixels. */
const KEY_PAN_PIXELS = 120

interface Drag {
  pointerId: number
  startX: number
  startScroll: number
}

export function useDragPan() {
  const ref = useRef<HTMLDivElement>(null)
  const drag = useRef<Drag | null>(null)
  return {
    ref,
    onPointerDown: (event: PointerEvent<HTMLDivElement>) => {
      drag.current = dragStartOf(event)
    },
    onPointerMove: (event: PointerEvent<HTMLDivElement>) => panByDrag(event, drag.current),
    onPointerUp: () => {
      drag.current = null
    },
    onKeyDown: (event: KeyboardEvent<HTMLDivElement>) => panByKey(event),
  }
}

function dragStartOf(event: PointerEvent<HTMLDivElement>): Drag {
  return {
    pointerId: event.pointerId,
    startX: event.clientX,
    startScroll: event.currentTarget.scrollLeft,
  }
}

function panByDrag(event: PointerEvent<HTMLDivElement>, drag: Drag | null): void {
  if (drag === null || drag.pointerId !== event.pointerId) return
  event.currentTarget.scrollLeft = drag.startScroll - (event.clientX - drag.startX)
}

function panByKey(event: KeyboardEvent<HTMLDivElement>): void {
  const step = PAN_KEYS[event.key]
  if (step === undefined) return
  event.preventDefault()
  event.currentTarget.scrollLeft += step * KEY_PAN_PIXELS
}

const PAN_KEYS: Readonly<Record<string, number>> = { ArrowLeft: -1, ArrowRight: 1 }
