/**
 * The power-up uses the effects layer starts next frame (ticket 250): the authority's, heard
 * through `listenForDomainEvents`, and a debug preview's. Presentation only: nothing here reaches
 * the authority, the store or the log. A use is a rare moment, so the queue is a plain array the
 * layer empties each frame.
 */
import { vehiclePresence } from '../../../scene/vehiclePresence'
import type { DomainEvent } from '../../../systems/authority/domainEvent'
import { fxStartsOf, type FxStart } from '../systems/render/powerUpFxFeed'

const queued: FxStart[] = []

/** A `listenForDomainEvents` listener. */
export function hearPowerUpUses(events: readonly DomainEvent[]): void {
  queued.push(...fxStartsOf(events))
}

/** The uses heard since the last frame. */
export function queuedFxStarts(): readonly FxStart[] {
  return queued
}

export function clearFxStarts(): void {
  queued.length = 0
}

/** Plays the item's effects at the vehicle's tile as a use at `mark`; nothing in the world changes. */
export function previewFxAtVehicle(itemId: string, mark: number): void {
  // A tile is a metre (#4), so the vehicle's tile is its drawn position floored.
  const [tx, ty] = [Math.floor(vehiclePresence.x), Math.floor(vehiclePresence.y)]
  queued.push({ itemId, tx, ty, mark })
}
