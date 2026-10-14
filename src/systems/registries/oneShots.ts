/**
 * The kernel's own one-shot sounds a slice may ask for by name (TD lock on #288 Q2, option b;
 * ticket 372): a slice registers `{ id, voice }` and plays it with `requestOneShot(id)`
 * (`store/oneShotRequests.ts`); the sound stage plays the kernel voice (`clankLight`, the light
 * clank). Client-only: no authority event, digest, protocol or save reads it. Bore gun, shoring and
 * dynamite may add entries later; a new voice joins `KernelVoice` in a kernel ticket.
 */
import { defineRegistry, entriesOf } from './seal'

/** A kernel sound a one-shot plays: `clankLight` is `playClank('light')`. */
export type KernelVoice = 'clankLight'

export interface OneShot {
  id: string
  voice: KernelVoice
}

export const ONE_SHOT_REGISTRY = defineRegistry<OneShot>('oneShots')

/** The registered one-shot `id`, or null. */
export function oneShotById(id: string): OneShot | null {
  return entriesOf(ONE_SHOT_REGISTRY).find((oneShot) => oneShot.id === id) ?? null
}
