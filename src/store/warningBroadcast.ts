/**
 * Hands the warning ladder's firings (ticket 685) to whoever rings and buzzes them: the sound
 * stage's bells and the haptics follower. The store's warning slice announces each firing as its
 * watch steps; listeners only present, they never write the store or submit. A plain list and
 * listener set, not store state, because a firing is a moment the screen never renders; the list
 * is the run's firings in order for the debug API, forgotten with the run by `resetGameStore`.
 */
import type { WarningFiring } from '../systems/views/warningWatch'

export type WarningListener = (firing: WarningFiring) => void

const fired: WarningFiring[] = []
const listeners = new Set<WarningListener>()

/** Returns the call that stops listening. */
export function listenForWarnings(listener: WarningListener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function announceWarnings(firings: readonly WarningFiring[]): void {
  for (const firing of firings) {
    fired.push(firing)
    listeners.forEach((listener) => listener(firing))
  }
}

/** Every firing of the run so far, oldest first. */
export function readFiredWarnings(): readonly WarningFiring[] {
  return fired
}

export function forgetFiredWarnings(): void {
  fired.length = 0
}
