/**
 * The gamepad (ticket 346): the one place `navigator.getGamepads` is read. The pad API has no
 * events for input, only for connection, so a poll runs once per animation frame while a pad is
 * connected and stops when none is: with no pad nothing runs, and the key and mouse streams are
 * what they were. The browser's own `Gamepad` object goes to the listener as it stands, so a poll
 * allocates nothing of ours.
 */
import type { PadReading } from '../systems/input/padFrame'

const STANDARD_MAPPING = 'standard'

/** Calls `listener` with the pad each frame while one is connected, then null once; an unsubscribe. */
export function listenForGamepad(listener: (pad: PadReading | null) => void): () => void {
  let frame: number | null = null
  const poll = () => {
    const pad = firstConnectedPad()
    frame = pad === null ? null : window.requestAnimationFrame(poll)
    listener(pad)
  }
  const startPolling = () => {
    frame ??= window.requestAnimationFrame(poll)
  }
  window.addEventListener('gamepadconnected', startPolling)
  if (firstConnectedPad() !== null) startPolling()
  return () => {
    window.removeEventListener('gamepadconnected', startPolling)
    if (frame !== null) window.cancelAnimationFrame(frame)
    frame = null
  }
}

/** The first connected pad with the standard button layout, else the first connected one. */
function firstConnectedPad(): Gamepad | null {
  if (typeof navigator.getGamepads !== 'function') return null
  const pads = navigator.getGamepads()
  let fallback: Gamepad | null = null
  for (const pad of pads) {
    if (pad === null || !pad.connected) continue
    if (pad.mapping === STANDARD_MAPPING) return pad
    fallback ??= pad
  }
  return fallback
}
