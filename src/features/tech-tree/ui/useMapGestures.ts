/**
 * The tree map's gestures (#161 section 4; spec #470 PT-5): one finger or a mouse drags the map
 * both ways, two fingers pinch it around their midpoint (`mapGestures`), the arrow keys pan it.
 * The pointers, the pan and the zoom live in a ref and move the element's own scroll position and
 * its `--map-zoom`, never React state. The click that ends a drag or a pinch is swallowed, so
 * panning over a node never opens its card.
 */
import { useRef, type KeyboardEvent, type MouseEvent, type PointerEvent } from 'react'
import {
  anchoredScrollOf,
  MAP_ZOOM_MIN,
  midpointOf,
  pinchZoomOf,
  spanOf,
  type MapPoint,
} from '../systems/mapGestures'
import { NODE_PRESS_SLOP_PX } from '../systems/nodePress'

/** How far one arrow key press pans, in CSS pixels. */
const KEY_PAN_PIXELS = 120

interface Pan {
  start: MapPoint
  scrollLeft: number
  scrollTop: number
}

interface Pinch {
  span: number
  zoom: number
}

interface MapGesture {
  pointers: Map<number, MapPoint>
  pan: Pan | null
  pinch: Pinch | null
  zoom: number
  /** The pointers moved the map since the first went down: their click is not a tap. */
  hasMoved: boolean
}

export interface MapGestureHandlers {
  onPointerDown(event: PointerEvent<HTMLDivElement>): void
  onPointerMove(event: PointerEvent<HTMLDivElement>): void
  onPointerUp(event: PointerEvent<HTMLDivElement>): void
  onPointerCancel(event: PointerEvent<HTMLDivElement>): void
  onClickCapture(event: MouseEvent<HTMLDivElement>): void
  onKeyDown(event: KeyboardEvent<HTMLDivElement>): void
}

export function useMapGestures(): MapGestureHandlers {
  const gesture = useRef<MapGesture>({
    pointers: new Map(),
    pan: null,
    pinch: null,
    zoom: MAP_ZOOM_MIN,
    hasMoved: false,
  })
  return {
    onPointerDown: (event) => addPointer(gesture.current, event),
    onPointerMove: (event) => movePointer(gesture.current, event),
    onPointerUp: (event) => removePointer(gesture.current, event),
    onPointerCancel: (event) => removePointer(gesture.current, event),
    onClickCapture: (event) => swallowClickAfterMove(gesture.current, event),
    onKeyDown: panByKey,
  }
}

function addPointer(gesture: MapGesture, event: PointerEvent<HTMLDivElement>): void {
  if (gesture.pointers.size === 0) gesture.hasMoved = false
  gesture.pointers.set(event.pointerId, pointOf(event))
  restartGesture(gesture, event.currentTarget)
}

function movePointer(gesture: MapGesture, event: PointerEvent<HTMLDivElement>): void {
  if (!gesture.pointers.has(event.pointerId)) return
  gesture.pointers.set(event.pointerId, pointOf(event))
  if (gesture.pinch !== null) return pinchMap(gesture, gesture.pinch, event.currentTarget)
  if (gesture.pan !== null) panMap(gesture, gesture.pan, event)
}

function removePointer(gesture: MapGesture, event: PointerEvent<HTMLDivElement>): void {
  gesture.pointers.delete(event.pointerId)
  restartGesture(gesture, event.currentTarget)
}

/** One pointer pans from where it is now, two pinch from their spread now; a third waits. */
function restartGesture(gesture: MapGesture, viewport: HTMLDivElement): void {
  const points = [...gesture.pointers.values()]
  gesture.pan = points.length === 1 ? panFrom(points[0], viewport) : null
  gesture.pinch =
    points.length === 2 ? { span: spanOf(points[0], points[1]), zoom: gesture.zoom } : null
}

function panFrom(start: MapPoint, viewport: HTMLDivElement): Pan {
  return { start, scrollLeft: viewport.scrollLeft, scrollTop: viewport.scrollTop }
}

function panMap(gesture: MapGesture, pan: Pan, event: PointerEvent<HTMLDivElement>): void {
  const point = pointOf(event)
  if (spanOf(pan.start, point) > NODE_PRESS_SLOP_PX) gesture.hasMoved = true
  event.currentTarget.scrollLeft = pan.scrollLeft - (point.x - pan.start.x)
  event.currentTarget.scrollTop = pan.scrollTop - (point.y - pan.start.y)
}

function pinchMap(gesture: MapGesture, pinch: Pinch, viewport: HTMLDivElement): void {
  const [a, b] = [...gesture.pointers.values()]
  const zoom = pinchZoomOf(pinch.zoom, pinch.span, spanOf(a, b))
  gesture.hasMoved = true
  if (zoom === gesture.zoom) return
  const scroll = scrollKeepingPoint(viewport, midpointOf(a, b), zoom / gesture.zoom)
  viewport.style.setProperty('--map-zoom', `${zoom}`)
  viewport.scrollTo(scroll.x, scroll.y)
  gesture.zoom = zoom
}

/** Where the map scrolls to keep the point under the fingers' midpoint as it scales by `ratio`. */
function scrollKeepingPoint(viewport: HTMLDivElement, midpoint: MapPoint, ratio: number): MapPoint {
  const frame = viewport.getBoundingClientRect()
  return {
    x: anchoredScrollOf(viewport.scrollLeft, midpoint.x - frame.left, ratio),
    y: anchoredScrollOf(viewport.scrollTop, midpoint.y - frame.top, ratio),
  }
}

function swallowClickAfterMove(gesture: MapGesture, event: MouseEvent<HTMLDivElement>): void {
  if (!gesture.hasMoved) return
  gesture.hasMoved = false
  event.stopPropagation()
  event.preventDefault()
}

function panByKey(event: KeyboardEvent<HTMLDivElement>): void {
  const step = PAN_KEYS[event.key]
  if (step === undefined) return
  event.preventDefault()
  event.currentTarget.scrollLeft += step * KEY_PAN_PIXELS
}

const PAN_KEYS: Readonly<Record<string, number>> = { ArrowLeft: -1, ArrowRight: 1 }

function pointOf(event: PointerEvent): MapPoint {
  return { x: event.clientX, y: event.clientY }
}
