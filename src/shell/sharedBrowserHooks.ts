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
