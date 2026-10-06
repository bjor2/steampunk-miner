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

/** Calls `listener` on a resize, a rotation or a change of primary pointer; returns an unsubscribe. */
export function listenForScreenChanges(listener: () => void): () => void {
  const pointer = window.matchMedia(COARSE_POINTER)
  window.addEventListener('resize', listener)
  pointer.addEventListener('change', listener)
  return () => {
    window.removeEventListener('resize', listener)
    pointer.removeEventListener('change', listener)
  }
}

/** Custom properties on the page root (`--ui-scale` and the rest), read by every style sheet. */
export function setRootStyle(properties: Readonly<Record<string, string>>): void {
  const style = document.documentElement.style
  Object.entries(properties).forEach(([name, value]) => style.setProperty(name, value))
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
