/**
 * The Refinery bay's slots as the authority holds them (#105): one list per platform, shared by
 * every player first come first served, each slot empty or holding one batch of one ore tier.
 * A batch belongs to the player who queued it (only they collect it and are paid), and is ready at
 * a sim tick fixed when it was queued, so it keeps refining through dives and travel and the
 * server owns the timer. The record (`owner`, `tier`, `units`, `readyAtTick`) is what a later
 * mobile mode can reuse (#105 resolution); `queuedTick` and `queuedPlanet` are for the log.
 * Plain safe integers and strings only, so the canonical JSON and the digest stay exact.
 */
import { TICKS_PER_SECOND } from '../../../constants/physics'
import { refineSeconds, refinerySlotsStart } from '../../economy/refineryEconomy'
import { isJsonObject, isWholeNumber } from '../payloadFields'

export interface RefineryBatch {
  owner: string
  tier: number
  units: number
  readyAtTick: number
  queuedTick: number
  queuedPlanet: number
}

export type RefinerySlot = RefineryBatch | null

/** What a new platform's refinery has: `slotsStart` empty slots. */
export function newRefinerySlots(): readonly RefinerySlot[] {
  return Array.from({ length: refinerySlotsStart() }, () => null)
}

/** `refineSeconds` of sim time in fixed ticks. */
export function refineTicks(): number {
  return refineSeconds() * TICKS_PER_SECOND
}

export function isBatchReady(batch: RefineryBatch, tick: number): boolean {
  return tick >= batch.readyAtTick
}

/** The first empty slot, or null when every slot holds a batch. */
export function freeSlotIndex(slots: readonly RefinerySlot[]): number | null {
  const index = slots.indexOf(null)
  return index === -1 ? null : index
}

/** The slots holding a batch of this player's that is ready at `tick`, by slot index. */
export function readySlotsOf(
  slots: readonly RefinerySlot[],
  playerId: string,
  tick: number,
): number[] {
  return slots.flatMap((slot, index) => (isReadyBatchOf(slot, playerId, tick) ? [index] : []))
}

function isReadyBatchOf(slot: RefinerySlot, playerId: string, tick: number): boolean {
  return slot !== null && slot.owner === playerId && isBatchReady(slot, tick)
}

/** Why a snapshot's refinery slots cannot be restored; empty when they can. */
export function refinerySlotsProblems(value: unknown, path: string): string[] {
  if (!Array.isArray(value)) return [`${path} must be a list of slots`]
  return value.flatMap((slot, index) =>
    slot === null || isRefineryBatch(slot) ? [] : [`${path}[${index}] must be null or a batch`],
  )
}

/** A deep copy, so a restored session never shares a batch with the snapshot it came from. */
export function copyRefinerySlots(slots: readonly RefinerySlot[]): RefinerySlot[] {
  return slots.map((slot) => (slot === null ? null : { ...slot }))
}

function isRefineryBatch(value: unknown): boolean {
  if (!isJsonObject(value) || typeof value.owner !== 'string') return false
  const counts = [value.tier, value.units, value.readyAtTick, value.queuedTick, value.queuedPlanet]
  return counts.every(isWholeNumber)
}
