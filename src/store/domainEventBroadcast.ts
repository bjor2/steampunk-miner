/**
 * Hands every batch of authority events the store follows to the slices' own stores
 * (docs/standards/feature-slices.md 3.14, 6.4), so a slice keeps its UI state in its `store/`
 * without adding a `GameState` field. Shaped like `feedbackBroadcast.ts`: listeners only follow,
 * they never write the game store or submit, so no listener can change state or the digest. A
 * plain listener set, not store state, because a batch is a moment, not something the UI renders.
 */
import type { DomainEvent } from '../systems/authority/domainEvent'

/** `playerId` is the local player, as the store follows the session for them. */
export type DomainEventListener = (events: readonly DomainEvent[], playerId: string) => void

const listeners = new Set<DomainEventListener>()

/** Returns the call that stops listening. */
export function listenForDomainEvents(listener: DomainEventListener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** An empty batch (a restored session catching up) is not announced. */
export function announceDomainEvents(events: readonly DomainEvent[], playerId: string): void {
  if (events.length === 0) return
  listeners.forEach((listener) => listener(events, playerId))
}
