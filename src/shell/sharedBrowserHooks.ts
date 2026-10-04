/** Window plumbing both shells share; neither holds game rules. */

export function exposeOnWindow(name: string, handle: unknown): void {
  Object.defineProperty(window, name, { value: handle, configurable: true })
}

export function runOnPageHide(callback: () => void): void {
  window.addEventListener('pagehide', callback)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') callback()
  })
}

export function listenForKeys(listener: (code: string, isDown: boolean) => void): () => void {
  const onDown = (event: KeyboardEvent) => listener(event.code, true)
  const onUp = (event: KeyboardEvent) => listener(event.code, false)
  window.addEventListener('keydown', onDown)
  window.addEventListener('keyup', onUp)
  return () => {
    window.removeEventListener('keydown', onDown)
    window.removeEventListener('keyup', onUp)
  }
}
