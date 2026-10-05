/**
 * The run's music stingers (#49): which stinger each batch of authority events plays, kept in
 * order for the audio view model and handed to the sound stage. A plain list and listener set, not
 * store state: stingers are moments the screen never renders, and only the presentation reads them,
 * so nothing here can change state or the digest. `resetGameStore` forgets them with the run.
 */
import type { DomainEvent } from '../systems/authority/domainEvent'
import type { StingerId } from '../systems/audio/musicBook'
import { musicStingersOf } from '../systems/audio/musicStingers'

export type StingerListener = (stingerId: StingerId) => void

const played: StingerId[] = []
const listeners = new Set<StingerListener>()

/** Returns the call that stops listening. */
export function listenForStingers(listener: StingerListener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function recordMusicStingers(events: readonly DomainEvent[], playerId: string): void {
  for (const stingerId of musicStingersOf(events, playerId)) {
    played.push(stingerId)
    listeners.forEach((listener) => listener(stingerId))
  }
}

/** Every stinger of the run so far, in order. */
export function readPlayedStingers(): readonly StingerId[] {
  return played
}

export function forgetMusicStingers(): void {
  played.length = 0
}
