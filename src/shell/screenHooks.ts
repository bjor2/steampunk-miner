/**
 * The window's size and pointer, the page root's style, touches and the vibration motor (#173):
 * browser plumbing both shells share. It knows no layout rule; `systems/views/screenLayout` does.
 */
import type { ScreenReading } from '../systems/views/screenLayout'

const COARSE_POINTER = '(pointer: coarse)'

export function readScreen(): ScreenReading {
  return {
    widthPixels: window.innerWidth,
    heightPixels: window.innerHeight,
    isCoarsePointer: window.matchMedia(COARSE_POINTER).matches,
  }
}

/**
 * Calls `listener` on a resize, a rotation or a change of primary pointer, once, on the animation
 * frame after the last of a burst (ticket 483): iOS fires `resize` late after a rotation and again
 * as the URL bar moves `innerHeight`, so a burst lays the screen out once with the settled size.
 * Returns an unsubscribe.
 */
export function listenForScreenChanges(listener: () => void): () => void {
  const pointer = window.matchMedia(COARSE_POINTER)
  const settled = deferToNextFrame(listener, ANIMATION_FRAMES)
  window.addEventListener('resize', settled.request)
  pointer.addEventListener('change', settled.request)
  return () => {
    window.removeEventListener('resize', settled.request)
    pointer.removeEventListener('change', settled.request)
    settled.cancel()
  }
}

/** The browser's animation frames, behind a seam so the debounce runs in a node test. */
export interface FrameScheduler {
  requestFrame(callback: () => void): number
  cancelFrame(frame: number): void
}

const ANIMATION_FRAMES: FrameScheduler = {
  requestFrame: (callback) => window.requestAnimationFrame(callback),
  cancelFrame: (frame) => window.cancelAnimationFrame(frame),
}

/**
 * `request` runs `callback` on the next frame; another request before then moves it to the frame
 * after, so it runs once per burst. `cancel` drops a pending run.
 */
export function deferToNextFrame(
  callback: () => void,
  frames: FrameScheduler,
): { request: () => void; cancel: () => void } {
  let pending: number | null = null
  const cancel = () => {
    if (pending !== null) frames.cancelFrame(pending)
    pending = null
  }
  const run = () => {
    pending = null
    callback()
  }
  const request = () => {
    cancel()
    pending = frames.requestFrame(run)
  }
  return { request, cancel }
}

/** Custom properties on the page root (`--ui-scale` and the rest), read by every style sheet. */
export function setRootStyle(properties: Readonly<Record<string, string>>): void {
  const style = document.documentElement.style
  Object.entries(properties).forEach(([name, value]) => style.setProperty(name, value))
}

/** Attributes on the page root (`data-orientation`), read by the style sheets' layout switches. */
export function setRootAttributes(attributes: Readonly<Record<string, string>>): void {
  const root = document.documentElement
  Object.entries(attributes).forEach(([name, value]) => root.setAttribute(name, value))
}

/** Calls `listener` when a finger touches the page anywhere; returns an unsubscribe. */
export function listenForTouches(listener: () => void): () => void {
  const onPointerDown = (event: PointerEvent) => {
    if (event.pointerType === 'touch') listener()
  }
  window.addEventListener('pointerdown', onPointerDown, { capture: true })
  return () => window.removeEventListener('pointerdown', onPointerDown, { capture: true })
}

/** A short buzz where the device has a vibration motor; nothing anywhere else. */
export function vibrateDevice(milliseconds: number): void {
  if (typeof navigator.vibrate === 'function') navigator.vibrate(milliseconds)
}
