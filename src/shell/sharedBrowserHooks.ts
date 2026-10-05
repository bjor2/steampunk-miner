/** Window plumbing both shells share; neither holds game rules. */
import type { KeyChange, ScrollNotch } from './shell'

/** About one mouse-wheel notch in pixels, so a trackpad's small deltas add up to notches. */
const PIXELS_PER_NOTCH = 100
/** `WheelEvent.DOM_DELTA_LINE` deltas count lines; this is a line's height in pixels. */
const PIXELS_PER_LINE = 33
const DOM_DELTA_LINE = 1

export function exposeOnWindow(name: string, handle: unknown): void {
  Object.defineProperty(window, name, { value: handle, configurable: true })
}

export function runOnPageHide(callback: () => void): void {
  window.addEventListener('pagehide', callback)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') callback()
  })
}

export function listenForKeys(listener: (key: KeyChange) => void): () => void {
  const onDown = (event: KeyboardEvent) => listener(keyChangeOf(event, true))
  const onUp = (event: KeyboardEvent) => listener(keyChangeOf(event, false))
  window.addEventListener('keydown', onDown)
  window.addEventListener('keyup', onUp)
  return () => {
    window.removeEventListener('keydown', onDown)
    window.removeEventListener('keyup', onUp)
  }
}

function keyChangeOf(event: KeyboardEvent, isDown: boolean): KeyChange {
  return { code: event.code, isDown, isRepeat: event.repeat, isShiftHeld: event.shiftKey }
}

export function listenForScrollNotches(listener: (notch: ScrollNotch) => void): () => void {
  let pending = 0
  const onWheel = (event: WheelEvent) => {
    pending += wheelPixelsOf(event)
    pending = emitWholeNotches(pending, listener)
  }
  window.addEventListener('wheel', onWheel, { passive: true })
  return () => window.removeEventListener('wheel', onWheel)
}

function wheelPixelsOf(event: WheelEvent): number {
  return event.deltaMode === DOM_DELTA_LINE ? event.deltaY * PIXELS_PER_LINE : event.deltaY
}

/** Fires one notch per whole `PIXELS_PER_NOTCH` scrolled and returns what is left over. */
function emitWholeNotches(pixels: number, listener: (notch: ScrollNotch) => void): number {
  const notches = Math.trunc(pixels / PIXELS_PER_NOTCH)
  for (let i = 0; i < Math.abs(notches); i++) listener(notches < 0 ? 'up' : 'down')
  return pixels - notches * PIXELS_PER_NOTCH
}
