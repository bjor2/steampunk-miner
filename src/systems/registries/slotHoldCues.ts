/**
 * How a slot's hold ends, heard (ticket 253, G&V's definition on #204): a slice names which of its
 * domain events end a hold it keeps, such as the rivet patch's, and whether the hold was cancelled
 * or ran to the end. The kernel turns the answer into a feedback cue, a light clank for a cancel
 * and a chime for a finish, on the voices the game already has. Presentation only: nothing here
 * reaches the authority state, a snapshot or a digest. With nothing registered no event ends a
 * hold, so every batch sounds as before.
 */
import type { DomainEvent } from '../authority/domainEvent'
import { defineRegistry, entriesOf } from './seal'

export type SlotHoldEnd = 'cancelled' | 'finished'

export interface SlotHoldCueSource {
  id: string
  /** How the event ends one of the slice's holds, or null for an event that ends none. */
  holdEndOf(event: DomainEvent): SlotHoldEnd | null
}

export const SLOT_HOLD_CUE_REGISTRY = defineRegistry<SlotHoldCueSource>('slotHoldCues')

/** The first registered answer for the event, in id order; null when no source names it. */
export function slotHoldEndOf(event: DomainEvent): SlotHoldEnd | null {
  for (const source of entriesOf(SLOT_HOLD_CUE_REGISTRY)) {
    const end = source.holdEndOf(event)
    if (end !== null) return end
  }
  return null
}
