/**
 * Whether the HUD coverage overlay shows (ticket 682): off in every run until the debug API's
 * `ui.showHudCoverage(true)` turns it on. Never saved, logged or replayed; the overlay reads it
 * through `subscribeHudCoverage` (`useSyncExternalStore`'s shape).
 */
let isShown = false
const listeners = new Set<() => void>()

export function showHudCoverage(shown: boolean): void {
  isShown = shown
  listeners.forEach((listener) => listener())
}

export function isHudCoverageShown(): boolean {
  return isShown
}

/** Calls `listener` after every switch; returns the unsubscribe. */
export function subscribeHudCoverage(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
