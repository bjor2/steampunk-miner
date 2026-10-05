/** Window plumbing both shells share; neither holds game rules. */
import type { KeyChange } from './shell'

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
