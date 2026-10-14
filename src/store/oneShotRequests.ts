/**
 * How a slice asks for one of the kernel's named one-shots (TD lock on #288 Q2; ticket 372):
 * `requestOneShot` hands the request to whoever plays sound, the scene's sound stage. A plain
 * listener set like `soundCueRequests.ts`, not store state: a sound is a moment, so asking never
 * changes the store, the authority or a digest. An id nobody registered throws, so a typo fails
 * its spec instead of staying silent.
 */
import { oneShotById, type OneShot } from '../systems/registries/oneShots'

export type OneShotListener = (oneShot: OneShot) => void

const listeners = new Set<OneShotListener>()

/** Returns the call that stops listening. */
export function listenForOneShots(listener: OneShotListener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function requestOneShot(id: string): void {
  const oneShot = oneShotById(id)
  if (oneShot === null) throw new Error(`no slice registered the one-shot "${id}"`)
  listeners.forEach((listener) => listener(oneShot))
}
