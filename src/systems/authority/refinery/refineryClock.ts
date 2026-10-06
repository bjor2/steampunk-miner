/**
 * The refinery's timers on the authority clock (#105: the server owns them). A batch is ready at
 * the tick fixed when it was queued; the clock stops at that tick like it stops for a collapse, and
 * says `refine_ready` once, to the batch's owner, at exactly that tick. Nothing is stored for it:
 * the clock never runs a tick twice, so each ready tick is crossed once however ticks are batched.
 */
import type { AuthorityState } from '../authorityState'
import type { TickOutcome } from '../combat/combatTick'
import type { DomainEvent } from '../domainEvent'
import type { RefineryBatch, RefinerySlot } from './refineryBatch'

/** The earliest ready tick after `afterTick` among the slots, or null when none is coming. */
export function nextRefineReadyTick(
  slots: readonly RefinerySlot[],
  afterTick: number,
): number | null {
  const ticks = slots.flatMap((slot) => (slot === null ? [] : [slot.readyAtTick]))
  const coming = ticks.filter((tick) => tick > afterTick)
  return coming.length === 0 ? null : Math.min(...coming)
}

/** `refine_ready` for every batch ready at exactly `tick`, and the clock moved to it. */
export function announceReadyBatches(state: AuthorityState, tick: number): TickOutcome {
  return { state: { ...state, tick }, events: readyEventsAt(state.platform.refinerySlots, tick) }
}

function readyEventsAt(slots: readonly RefinerySlot[], tick: number): DomainEvent[] {
  return slots.flatMap((slot, index) => (isReadyAt(slot, tick) ? [readyEventOf(slot, index)] : []))
}

function isReadyAt(slot: RefinerySlot, tick: number): slot is RefineryBatch {
  return slot !== null && slot.readyAtTick === tick
}

function readyEventOf(batch: RefineryBatch, slot: number): DomainEvent {
  const { readyAtTick: tick, owner: playerId, tier, units } = batch
  return { tick, playerId, type: 'RefineReady', slot, tier, units }
}
