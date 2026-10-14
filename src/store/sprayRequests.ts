/**
 * How anyone asks for sparks, dust or debris (ticket 348, the TD kernel lock on #314 section 4):
 * `requestSpray` hands the request to whoever draws spray, which is the kernel's always-on
 * `SprayLayer`, so a slice's look never depends on another slice being loaded. Built like
 * `soundCueRequests.ts`: a plain listener set, not store state, because a spray is a moment the
 * UI never renders; asking never changes state or a digest. Callers may pass a reused scratch
 * request, so a listener reads it at once and never keeps it.
 *
 * Bounded users only: the bore gun opens at most one cell per 2 ticks over a range of 10. A user
 * at the drill's rate aggregates per tick before asking (#334).
 */
import type { SprayRequest } from '../systems/render/sprayPool'

export type { SprayKind, SprayPriority, SprayRequest } from '../systems/render/sprayPool'

export type SprayListener = (request: SprayRequest) => void

const listeners = new Set<SprayListener>()

/** Returns the call that stops listening. */
export function listenForSprays(listener: SprayListener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function requestSpray(request: SprayRequest): void {
  listeners.forEach((listener) => listener(request))
}
